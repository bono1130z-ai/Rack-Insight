"""Integration tests for Device Templates + instances (P5/P3/P2)."""
import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


@pytest_asyncio.fixture()
async def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path}/tpl.db")
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:6399/0")
    import config as app_config

    app_config.get_settings.cache_clear()

    import importlib

    import database.session as session_mod
    importlib.reload(session_mod)
    import database as db_pkg
    importlib.reload(db_pkg)
    import main as app_main
    importlib.reload(app_main)

    from database.migrations import run_migrations

    await run_migrations()
    await app_main._bootstrap_admin()

    async with AsyncClient(
        transport=ASGITransport(app=app_main.app), base_url="http://test"
    ) as c:
        token = (
            await c.post(
                "/api/auth/login", json={"username": "admin", "password": "admin123!"}
            )
        ).json()["access_token"]
        c.headers["Authorization"] = f"Bearer {token}"
        yield c

    await session_mod.engine.dispose()
    app_config.get_settings.cache_clear()


async def _rack(client: AsyncClient) -> str:
    cid = (await client.post("/api/clusters", json={"name": "C"})).json()["id"]
    return (await client.post("/api/racks", json={"cluster_id": cid, "name": "R"})).json()["id"]


@pytest.mark.asyncio
async def test_template_shared_by_instances(client: AsyncClient) -> None:
    rid = await _rack(client)
    tid = (
        await client.post(
            "/api/device-templates",
            json={"name": "HPE DL320", "vendor": "HPE", "model": "DL320"},
        )
    ).json()["id"]

    # vendor/model inherited from the template
    d1 = await client.post(
        "/api/devices",
        json={"rack_id": rid, "template_id": tid, "hostname": "a", "management_ip": "10.0.0.1"},
    )
    assert d1.status_code == 201
    assert d1.json()["vendor"] == "HPE"
    assert d1.json()["template_id"] == tid

    # a second instance shares the same template but keeps independent identity
    d2 = await client.post(
        "/api/devices",
        json={"rack_id": rid, "template_id": tid, "hostname": "b", "management_ip": "10.0.0.2"},
    )
    assert d2.json()["template_id"] == tid
    assert d2.json()["management_ip"] != d1.json()["management_ip"]

    summary = (await client.get("/api/device-templates")).json()
    assert summary[0]["instance_count"] == 2

    # cannot delete a template still in use
    assert (await client.delete(f"/api/device-templates/{tid}")).status_code == 409


@pytest.mark.asyncio
async def test_bulk_device_creation(client: AsyncClient) -> None:
    rid = await _rack(client)
    result = await client.post(
        "/api/devices/bulk",
        json={"rack_id": rid, "quantity": 3, "hostname_prefix": "DL320", "pad_width": 2},
    )
    assert result.status_code == 201
    assert [d["hostname"] for d in result.json()["created"]] == [
        "DL320-01",
        "DL320-02",
        "DL320-03",
    ]
    # duplicates are skipped, not errored
    rerun = await client.post(
        "/api/devices/bulk",
        json={"rack_id": rid, "quantity": 4, "hostname_prefix": "DL320", "pad_width": 2},
    )
    assert [d["hostname"] for d in rerun.json()["created"]] == ["DL320-04"]
    assert set(rerun.json()["skipped"]) == {"DL320-01", "DL320-02", "DL320-03"}


@pytest.mark.asyncio
async def test_assign_and_unassign(client: AsyncClient) -> None:
    rid = await _rack(client)
    did = (
        await client.post(
            "/api/devices", json={"rack_id": rid, "hostname": "srv"}
        )
    ).json()["id"]

    assert (
        await client.put(f"/api/devices/{did}/position", json={"u_position": 5})
    ).status_code == 200
    layout = (await client.get(f"/api/racks/{rid}/layout")).json()
    assert [u["u_position"] for u in layout["units"]] == [5]

    assert (await client.delete(f"/api/devices/{did}/position")).status_code == 204
    layout = (await client.get(f"/api/racks/{rid}/layout")).json()
    assert layout["units"] == []
    # the device itself still exists (uninstalled, not deleted)
    assert (await client.get(f"/api/devices/{did}")).status_code == 200

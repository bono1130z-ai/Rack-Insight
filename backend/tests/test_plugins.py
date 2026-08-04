"""Tests for the Plugin Architecture Foundation.

Covers manifest parsing, registry CRUD, health lifecycle, failure isolation,
the REST proxy (GET/POST), and permission enforcement. The Example Plugin's
real ASGI app is used as the plugin under test (routed in-process via httpx
ASGITransport), so the contract is exercised end-to-end without a live socket.
"""
import sys
from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Import the standalone example plugin app (independent codebase under plugins/).
EXAMPLE_DIR = Path(__file__).resolve().parents[2] / "plugins" / "example-plugin"
sys.path.insert(0, str(EXAMPLE_DIR))
import app as example_plugin  # noqa: E402


def _example_client_factory():
    """A plugin_client-compatible client that routes to the example ASGI app."""
    return AsyncClient(
        transport=ASGITransport(app=example_plugin.app),
        base_url="http://example-plugin:8080",
        timeout=5,
    )


class _BoomTransport(httpx.AsyncBaseTransport):
    """Simulates a dead/unreachable plugin."""

    def __init__(self, exc: Exception):
        self._exc = exc

    async def handle_async_request(self, request):
        raise self._exc


def _down_client_factory(exc: Exception):
    def factory():
        return AsyncClient(transport=_BoomTransport(exc), base_url="http://x", timeout=5)

    return factory


@pytest_asyncio.fixture()
async def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path}/plugins.db")
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    monkeypatch.setenv("PLUGIN_HEALTH_ENABLED", "false")
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

    # Route the Core's plugin client at the in-process example plugin.
    import services.plugin_client as pc
    monkeypatch.setattr(pc, "_make_client", _example_client_factory)

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


# --- Contract / manifest ------------------------------------------------------
def test_manifest_parses_camelcase_contract():
    from schemas.plugin import PluginManifest

    manifest = PluginManifest.model_validate(example_plugin.MANIFEST)
    assert manifest.name == "example-plugin"
    assert manifest.display_name == "Example Plugin"  # from displayName
    assert manifest.api_version == "v1"
    assert manifest.health_endpoint == "/healthz"


def test_manifest_ignores_unknown_fields_and_defaults():
    from schemas.plugin import PluginManifest

    manifest = PluginManifest.model_validate(
        {"name": "p", "display_name": "P", "somethingNew": 123}
    )
    assert manifest.version == "0.0.0"
    assert manifest.api_version == "v1"  # default when absent


# --- Registry CRUD ------------------------------------------------------------
@pytest.mark.asyncio
async def test_register_list_get_and_manifest_enrichment(client):
    created = await client.post(
        "/api/plugins",
        json={"name": "example-plugin", "endpoint": "http://example-plugin:8080"},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    # Manifest was fetched from the (in-process) plugin and enriched the record.
    assert body["version"] == "1.0.0"
    assert body["api_version"] == "v1"
    assert body["display_name"] == "Example Plugin"
    assert body["status"] == "UNKNOWN"

    listed = (await client.get("/api/plugins")).json()
    assert [p["name"] for p in listed] == ["example-plugin"]

    got = await client.get(f"/api/plugins/{body['id']}")
    assert got.status_code == 200
    assert got.json()["endpoint"] == "http://example-plugin:8080"


@pytest.mark.asyncio
async def test_duplicate_registration_conflicts(client):
    await client.post(
        "/api/plugins",
        json={"name": "dup", "endpoint": "http://example-plugin:8080"},
    )
    again = await client.post(
        "/api/plugins",
        json={"name": "dup", "endpoint": "http://example-plugin:8080"},
    )
    assert again.status_code == 409


@pytest.mark.asyncio
async def test_get_unknown_plugin_404(client):
    import uuid

    assert (
        await client.get(f"/api/plugins/{uuid.uuid4()}")
    ).status_code == 404


# --- Health lifecycle ---------------------------------------------------------
@pytest.mark.asyncio
async def test_health_check_healthy(client):
    body = (
        await client.post(
            "/api/plugins",
            json={"name": "example-plugin", "endpoint": "http://example-plugin:8080"},
        )
    ).json()
    checked = await client.post(f"/api/plugins/{body['id']}/health-check")
    assert checked.status_code == 200
    assert checked.json()["status"] == "HEALTHY"
    assert checked.json()["last_success_at"] is not None


@pytest.mark.asyncio
async def test_health_check_unhealthy_when_plugin_down(client, monkeypatch):
    body = (
        await client.post(
            "/api/plugins",
            json={"name": "downp", "endpoint": "http://downp:9999"},
        )
    ).json()
    import services.plugin_client as pc
    monkeypatch.setattr(
        pc, "_make_client", _down_client_factory(httpx.ConnectError("refused"))
    )
    checked = (await client.post(f"/api/plugins/{body['id']}/health-check")).json()
    assert checked["status"] == "UNHEALTHY"
    assert checked["failure_reason"]

    # Failure isolation: Core stays healthy while a plugin is down.
    assert (await client.get("/api/health")).status_code == 200
    assert (await client.get("/api/clusters")).status_code == 200


@pytest.mark.asyncio
async def test_health_check_timeout_is_isolated(client, monkeypatch):
    body = (
        await client.post(
            "/api/plugins",
            json={"name": "slowp", "endpoint": "http://slowp:9999"},
        )
    ).json()
    import services.plugin_client as pc
    monkeypatch.setattr(
        pc, "_make_client", _down_client_factory(httpx.ReadTimeout("timeout"))
    )
    checked = (await client.post(f"/api/plugins/{body['id']}/health-check")).json()
    assert checked["status"] == "UNHEALTHY"


@pytest.mark.asyncio
async def test_disabled_plugin_reports_disabled(client):
    body = (
        await client.post(
            "/api/plugins",
            json={"name": "example-plugin", "endpoint": "http://example-plugin:8080"},
        )
    ).json()
    patched = await client.patch(
        f"/api/plugins/{body['id']}", json={"enabled": False}
    )
    assert patched.json()["status"] == "DISABLED"
    checked = (await client.post(f"/api/plugins/{body['id']}/health-check")).json()
    assert checked["status"] == "DISABLED"


@pytest.mark.asyncio
async def test_invalid_manifest_does_not_break_registration(client, monkeypatch):
    import services.plugin_client as pc

    async def _bad_manifest(endpoint):
        raise pc.PluginUnavailable("malformed manifest")

    monkeypatch.setattr(pc, "fetch_manifest", _bad_manifest)
    created = await client.post(
        "/api/plugins",
        json={"name": "badmani", "endpoint": "http://badmani:8080"},
    )
    # Registration still succeeds; metadata simply isn't enriched.
    assert created.status_code == 201
    assert created.json()["version"] is None


# --- Proxy --------------------------------------------------------------------
@pytest.mark.asyncio
async def test_proxy_get_and_post(client):
    await client.post(
        "/api/plugins",
        json={"name": "example-plugin", "endpoint": "http://example-plugin:8080"},
    )
    got = await client.get("/api/plugins/example-plugin/proxy/api/status")
    assert got.status_code == 200
    assert got.json() == {
        "plugin": "example-plugin",
        "status": "running",
        "version": "1.0.0",
    }

    posted = await client.post(
        "/api/plugins/example-plugin/proxy/api/echo", json={"hello": "world"}
    )
    assert posted.status_code == 200
    assert posted.json()["echo"] == {"hello": "world"}


@pytest.mark.asyncio
async def test_proxy_unknown_plugin_404(client):
    assert (
        await client.get("/api/plugins/not-found/proxy/api/status")
    ).status_code == 404


@pytest.mark.asyncio
async def test_proxy_disabled_plugin_503(client):
    body = (
        await client.post(
            "/api/plugins",
            json={"name": "example-plugin", "endpoint": "http://example-plugin:8080"},
        )
    ).json()
    await client.patch(f"/api/plugins/{body['id']}", json={"enabled": False})
    resp = await client.get("/api/plugins/example-plugin/proxy/api/status")
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_proxy_down_plugin_returns_503_not_500(client, monkeypatch):
    await client.post(
        "/api/plugins",
        json={"name": "example-plugin", "endpoint": "http://example-plugin:8080"},
    )
    import services.plugin_client as pc
    monkeypatch.setattr(
        pc, "_make_client", _down_client_factory(httpx.ConnectError("refused"))
    )
    resp = await client.get("/api/plugins/example-plugin/proxy/api/status")
    assert resp.status_code == 503


# --- Permission enforcement ---------------------------------------------------
async def _login(app, username, password) -> AsyncClient:
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    token = (
        await c.post(
            "/api/auth/login", json={"username": username, "password": password}
        )
    ).json()["access_token"]
    c.headers["Authorization"] = f"Bearer {token}"
    return c


@pytest.mark.asyncio
async def test_viewer_can_view_but_not_manage_plugins(client):
    import main as app_main

    # Give a Viewer-role user (USER account in the Viewers group).
    roles = {r["name"]: r for r in (await client.get("/api/roles")).json()}
    group = (
        await client.post(
            "/api/user-groups",
            json={"name": "Viewers", "role_ids": [roles["Viewer"]["id"]]},
        )
    ).json()
    await client.post(
        "/api/users",
        json={
            "username": "vic",
            "password": "viewerpass1",
            "role": "USER",
            "group_ids": [group["id"]],
        },
    )
    viewer = await _login(app_main.app, "vic", "viewerpass1")
    try:
        assert (await viewer.get("/api/plugins")).status_code == 200
        denied = await viewer.post(
            "/api/plugins", json={"name": "x", "endpoint": "http://x:8080"}
        )
        assert denied.status_code == 403
        # Viewer lacks plugin.proxy too.
        assert (
            await viewer.get("/api/plugins/example-plugin/proxy/api/status")
        ).status_code == 403
    finally:
        await viewer.aclose()

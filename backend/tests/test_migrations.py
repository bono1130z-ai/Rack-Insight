"""Guard: SQLAlchemy models and Alembic migrations must stay in sync.

If this test fails, a model was changed without creating a migration.
Fix it with:

    cd backend
    alembic revision --autogenerate -m "describe the change"
    alembic upgrade head
"""
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine

import config as app_config
import models  # noqa: F401  (register every model on the metadata)
from database.session import Base

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Structural drift we refuse to ship without a migration. Constraint/index
# tweaks are excluded to avoid dialect-specific noise on SQLite.
SIGNIFICANT_DIFFS = {"add_table", "remove_table", "add_column", "remove_column"}


def _diff_kind(diff: object) -> str:
    entry = diff[0] if isinstance(diff, list) else diff
    return str(entry[0])


@pytest.fixture()
def migrated_db_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> str:
    db_path = tmp_path / "migration_check.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    app_config.get_settings.cache_clear()

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(config, "head")

    yield f"sqlite:///{db_path}"

    app_config.get_settings.cache_clear()


def test_migrations_match_models(migrated_db_url: str) -> None:
    engine = create_engine(migrated_db_url)
    try:
        with engine.connect() as connection:
            context = MigrationContext.configure(
                connection, opts={"compare_type": False}
            )
            diffs = compare_metadata(context, Base.metadata)
    finally:
        engine.dispose()

    drift = [d for d in diffs if _diff_kind(d) in SIGNIFICANT_DIFFS]
    assert not drift, (
        "Models and Alembic migrations are out of sync. "
        "Create a migration: alembic revision --autogenerate -m '...' "
        f"Drift detected: {drift}"
    )


def test_migrations_up_and_down(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Every migration must be reversible down to base and back."""
    db_path = tmp_path / "updown.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    app_config.get_settings.cache_clear()

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(config, "head")
    command.downgrade(config, "base")
    command.upgrade(config, "head")

    app_config.get_settings.cache_clear()


def test_adopts_partial_create_all_database(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Regression: pre-Alembic create_all startups created the NEW TABLES
    (credentials, collector_runs) but not the NEW COLUMNS (clusters.site,
    devices.orientation, ...). Startup migration must adopt that mixed state
    without DuplicateTable crashes."""
    import asyncio
    import sqlite3

    from sqlalchemy import create_engine as sa_create_engine

    from database.migrations import run_migrations
    from models import CollectorRun, Credential

    db_path = tmp_path / "partial.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    app_config.get_settings.cache_clear()

    # 1) Old schema at revision 0001...
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(config, "0001")

    # 2) ...plus the new tables that create_all would have added, and no
    #    alembic bookkeeping (exactly what a legacy deployment looks like).
    sync_engine = sa_create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(
        sync_engine, tables=[Credential.__table__, CollectorRun.__table__]
    )
    sync_engine.dispose()
    conn = sqlite3.connect(db_path)
    conn.execute("DROP TABLE alembic_version")
    conn.execute(
        "INSERT INTO clusters (id, name, created_at, updated_at) "
        "VALUES ('1111', 'Legacy', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    )
    conn.commit()
    conn.close()

    # 3) Startup migration must adopt and upgrade it in place.
    asyncio.run(run_migrations())

    conn = sqlite3.connect(db_path)
    cluster_columns = [r[1] for r in conn.execute("PRAGMA table_info(clusters)")]
    device_columns = [r[1] for r in conn.execute("PRAGMA table_info(devices)")]
    revision = conn.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    preserved = conn.execute("SELECT name FROM clusters").fetchone()[0]
    conn.close()

    assert "site" in cluster_columns
    assert "orientation" in device_columns
    assert "redfish_credential_id" in device_columns
    assert revision == "0002"
    assert preserved == "Legacy"

    app_config.get_settings.cache_clear()

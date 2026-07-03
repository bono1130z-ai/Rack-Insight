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

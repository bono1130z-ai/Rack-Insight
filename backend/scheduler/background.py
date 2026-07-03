"""Background scheduler: every N seconds (default 30 min) re-collect all
enabled, online devices so the UI stays current without user action."""
import asyncio

from sqlalchemy import select

from cache.redis_cache import cache_set, device_inventory_key
from collectors.manager import CollectorManager
from config import get_settings
from database import async_session_factory
from models import Device, DeviceStatus
from services.inventory_service import load_snapshot_inventory
from services.refresh_service import record_collector_run
from utils.logging import get_logger

logger = get_logger(__name__)

_task: asyncio.Task[None] | None = None


async def _collect_all_online() -> None:
    manager = CollectorManager()
    async with async_session_factory() as db:
        result = await db.execute(
            select(Device).where(
                Device.enabled.is_(True), Device.status == DeviceStatus.ONLINE
            )
        )
        devices = list(result.scalars().all())
        logger.info("Scheduler run: %d online devices", len(devices))
        for device in devices:
            try:
                outcome = await manager.collect_device(db, device)
                record_collector_run(db, device, outcome, trigger="scheduled")
                device.status = outcome.status
                await db.commit()
                if outcome.snapshot is not None:
                    inventory = await load_snapshot_inventory(db, outcome.snapshot)
                    await cache_set(
                        device_inventory_key(str(device.id)),
                        inventory.model_dump(mode="json"),
                    )
            except Exception:
                await db.rollback()
                logger.exception("Scheduled collection failed for %s", device.hostname)


async def _loop() -> None:
    settings = get_settings()
    while True:
        await asyncio.sleep(settings.scheduler_interval_seconds)
        try:
            await _collect_all_online()
        except Exception:
            logger.exception("Scheduler iteration failed")


def start_scheduler() -> None:
    global _task
    if get_settings().scheduler_enabled and _task is None:
        _task = asyncio.create_task(_loop())
        logger.info(
            "Background scheduler started (interval=%ds)",
            get_settings().scheduler_interval_seconds,
        )


def stop_scheduler() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        _task = None
        logger.info("Background scheduler stopped")

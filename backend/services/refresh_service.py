"""Device refresh flow:
delete cache -> run CollectorManager -> save snapshot -> update device status
-> repopulate cache -> return fresh inventory."""
import uuid

from fastapi import HTTPException, status as http_status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cache.redis_cache import cache_delete, cache_set, device_inventory_key
from collectors.manager import CollectionOutcome, CollectorManager
from models import CollectorRun, Device
from schemas.inventory import DeviceInventoryResponse
from services.inventory_service import load_snapshot_inventory
from utils.logging import get_logger

logger = get_logger(__name__)


def record_collector_run(
    db: AsyncSession, device: Device, outcome: CollectionOutcome, trigger: str
) -> None:
    """Append an audit entry for this collection attempt (success or failure)."""
    errors = [
        f"{r.collector_name}: {r.error}"
        for r in outcome.results
        if not r.skipped and not r.success and r.error
    ]
    ran = [r.collector_name for r in outcome.results if not r.skipped and r.success]
    message_parts: list[str] = []
    if ran:
        message_parts.append(f"succeeded: {', '.join(ran)}")
    if errors:
        message_parts.append("; ".join(errors))
    db.add(
        CollectorRun(
            device_id=device.id,
            success=outcome.snapshot is not None,
            duration_ms=max((r.duration_ms for r in outcome.results), default=0),
            snapshot_id=outcome.snapshot.id if outcome.snapshot is not None else None,
            message="; ".join(message_parts) or None,
            trigger=trigger,
        )
    )


async def refresh_device(db: AsyncSession, device_id: uuid.UUID) -> DeviceInventoryResponse:
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND, detail="Device not found"
        )

    key = device_inventory_key(str(device_id))
    await cache_delete(key)

    manager = CollectorManager()
    outcome = await manager.collect_device(db, device)
    record_collector_run(db, device, outcome, trigger="manual")

    device.status = outcome.status
    if outcome.system.get("manufacturer") and not device.vendor:
        device.vendor = outcome.system["manufacturer"]
    if outcome.system.get("model") and not device.model:
        device.model = outcome.system["model"]
    await db.commit()

    if outcome.snapshot is None:
        raise HTTPException(
            status_code=http_status.HTTP_502_BAD_GATEWAY,
            detail="All collectors failed; previous data preserved",
        )

    inventory = await load_snapshot_inventory(db, outcome.snapshot)
    await cache_set(key, inventory.model_dump(mode="json"))
    return inventory

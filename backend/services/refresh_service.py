"""Device refresh flow:
delete cache -> run CollectorManager -> save snapshot -> update device status
-> repopulate cache -> return fresh inventory."""
import uuid

from fastapi import HTTPException, status as http_status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cache.redis_cache import cache_delete, cache_set, device_inventory_key
from collectors.manager import CollectorManager
from models import Device
from schemas.inventory import DeviceInventoryResponse
from services.inventory_service import load_snapshot_inventory
from utils.logging import get_logger

logger = get_logger(__name__)


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

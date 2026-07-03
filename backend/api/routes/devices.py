"""Device CRUD, latest inventory, health, and refresh endpoints."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user, require_admin
from cache.redis_cache import cache_delete, device_inventory_key
from database import get_db
from models import CPU, Device, Firmware, RackUnit, Sensor, Storage
from schemas.device import (
    VALID_COLLECTOR_TYPES,
    DeviceCreate,
    DeviceDetailResponse,
    DevicePositionUpdate,
    DeviceResponse,
    DeviceUpdate,
)
from schemas.inventory import DeviceInventoryResponse
from services.health_service import compute_health
from services.inventory_service import get_device_inventory, get_latest_snapshot
from services.refresh_service import refresh_device
from utils.crypto import encrypt_secret
from utils.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/devices", tags=["devices"], dependencies=[Depends(get_current_user)])

_SECRET_FIELDS = {
    "ilo_password": "ilo_password_encrypted",
    "ssh_password": "ssh_password_encrypted",
    "snmp_community": "snmp_community_encrypted",
}


def _serialize_collector_types(types: list[str] | None) -> str | None:
    """Validate and join the collector type list into the stored string."""
    if not types:
        return None
    normalized = [t.strip().upper() for t in types if t.strip()]
    invalid = set(normalized) - VALID_COLLECTOR_TYPES
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid collector types: {', '.join(sorted(invalid))}",
        )
    return ",".join(dict.fromkeys(normalized)) or None


async def _get_device(db: AsyncSession, device_id: uuid.UUID) -> Device:
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    return device


@router.get("", response_model=list[DeviceResponse])
async def list_devices(
    rack_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)
) -> list[Device]:
    query = select(Device).order_by(Device.hostname)
    if rack_id is not None:
        query = query.where(Device.rack_id == rack_id)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/{device_id}", response_model=DeviceDetailResponse)
async def get_device(
    device_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> DeviceDetailResponse:
    try:
        device = await _get_device(db, device_id)
        detail = DeviceDetailResponse.model_validate(device)

        snapshot = await get_latest_snapshot(db, device_id)
        if snapshot is not None:
            detail.last_refresh = snapshot.collected_at
            sensors = (
                (await db.execute(select(Sensor).where(Sensor.snapshot_id == snapshot.id)))
                .scalars().all()
            )
            storages = (
                (await db.execute(select(Storage).where(Storage.snapshot_id == snapshot.id)))
                .scalars().all()
            )
            firmwares = (
                (await db.execute(select(Firmware).where(Firmware.snapshot_id == snapshot.id)))
                .scalars().all()
            )
            cpus = (
                (await db.execute(select(CPU).where(CPU.snapshot_id == snapshot.id)))
                .scalars().all()
            )
            health = compute_health(
                device.status, snapshot, list(sensors), list(storages), list(firmwares)
            )
            detail.health_score = health.score
            detail.health_label = health.label
            serials = [c.serial for c in cpus if c.serial]
            detail.serial = serials[0] if serials else None
        return detail
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Device detail failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Device detail failed"
        ) from exc


@router.get("/{device_id}/inventory", response_model=DeviceInventoryResponse)
async def get_inventory(
    device_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> DeviceInventoryResponse:
    try:
        await _get_device(db, device_id)
        return await get_device_inventory(db, device_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Inventory read failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Inventory read failed"
        ) from exc


@router.post(
    "/{device_id}/refresh",
    response_model=DeviceInventoryResponse,
    dependencies=[Depends(require_admin)],
)
async def refresh(
    device_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> DeviceInventoryResponse:
    try:
        return await refresh_device(db, device_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Device refresh failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Device refresh failed"
        ) from exc


@router.post(
    "",
    response_model=DeviceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_device(payload: DeviceCreate, db: AsyncSession = Depends(get_db)) -> Device:
    try:
        data = payload.model_dump(exclude={"u_position", "height"})
        for plain_field, encrypted_field in _SECRET_FIELDS.items():
            data[encrypted_field] = encrypt_secret(data.pop(plain_field, None))
        data["collector_types"] = _serialize_collector_types(data.pop("collector_types", None))
        device = Device(**data)
        db.add(device)
        await db.flush()

        if payload.u_position is not None:
            db.add(
                RackUnit(
                    rack_id=payload.rack_id,
                    u_position=payload.u_position,
                    height=payload.height,
                    device_id=device.id,
                )
            )
        await db.commit()
        await db.refresh(device)
        logger.info("Device %s registered", device.hostname)
        return device
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Device creation failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Device creation failed"
        ) from exc


@router.patch(
    "/{device_id}", response_model=DeviceResponse, dependencies=[Depends(require_admin)]
)
async def update_device(
    device_id: uuid.UUID, payload: DeviceUpdate, db: AsyncSession = Depends(get_db)
) -> Device:
    device = await _get_device(db, device_id)
    data = payload.model_dump(exclude_unset=True)
    for plain_field, encrypted_field in _SECRET_FIELDS.items():
        if plain_field in data:
            data[encrypted_field] = encrypt_secret(data.pop(plain_field))
    if "collector_types" in data:
        data["collector_types"] = _serialize_collector_types(data["collector_types"])
    for key, value in data.items():
        setattr(device, key, value)
    await db.commit()
    await db.refresh(device)
    return device


@router.put(
    "/{device_id}/position",
    response_model=DeviceResponse,
    dependencies=[Depends(require_admin)],
)
async def move_device(
    device_id: uuid.UUID, payload: DevicePositionUpdate, db: AsyncSession = Depends(get_db)
) -> Device:
    """Move a device to a new U position (drag & drop / U selection)."""
    device = await _get_device(db, device_id)
    try:
        rack = device.rack
        unit_result = await db.execute(
            select(RackUnit).where(RackUnit.device_id == device_id)
        )
        unit = unit_result.scalars().first()
        height = payload.height if payload.height is not None else (unit.height if unit else 1)

        if payload.u_position + height - 1 > rack.height:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"U{payload.u_position} (+{height}U) exceeds rack height {rack.height}U",
            )

        others = (
            (
                await db.execute(
                    select(RackUnit).where(
                        RackUnit.rack_id == device.rack_id, RackUnit.device_id != device_id
                    )
                )
            )
            .scalars().all()
        )
        target_span = set(range(payload.u_position, payload.u_position + height))
        for other in others:
            other_span = set(range(other.u_position, other.u_position + other.height))
            if target_span & other_span:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"U{payload.u_position} overlaps an existing unit at U{other.u_position}",
                )

        if unit is None:
            db.add(
                RackUnit(
                    rack_id=device.rack_id,
                    u_position=payload.u_position,
                    height=height,
                    device_id=device_id,
                )
            )
        else:
            unit.u_position = payload.u_position
            unit.height = height
        await db.commit()
        await db.refresh(device)
        return device
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Device move failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Device move failed"
        ) from exc


@router.delete(
    "/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_device(device_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    device = await _get_device(db, device_id)
    await cache_delete(device_inventory_key(str(device_id)))
    await db.delete(device)
    await db.commit()

"""Dashboard summaries: cluster cards and rack cards."""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Cluster, Device, DeviceStatus, DeviceType, Rack, Snapshot
from schemas.cluster import ClusterSummary
from schemas.rack import RackSummary


async def cluster_summaries(db: AsyncSession) -> list[ClusterSummary]:
    clusters = (await db.execute(select(Cluster).order_by(Cluster.name))).scalars().all()
    summaries: list[ClusterSummary] = []
    for cluster in clusters:
        rack_ids = (
            (await db.execute(select(Rack.id).where(Rack.cluster_id == cluster.id)))
            .scalars().all()
        )
        summary = ClusterSummary.model_validate(cluster)
        summary.rack_count = len(rack_ids)
        if rack_ids:
            devices = (
                (await db.execute(select(Device).where(Device.rack_id.in_(rack_ids))))
                .scalars().all()
            )
            summary.device_count = len(devices)
            summary.server_count = sum(
                1 for d in devices if d.device_type == DeviceType.SERVER
            )
            summary.switch_count = sum(
                1 for d in devices if d.device_type == DeviceType.SWITCH
            )
            summary.online_count = sum(1 for d in devices if d.status == DeviceStatus.ONLINE)
            summary.warning_count = sum(
                1 for d in devices if d.status == DeviceStatus.WARNING
            )
            device_ids = [d.id for d in devices]
            if device_ids:
                summary.last_refresh = (
                    await db.execute(
                        select(func.max(Snapshot.collected_at)).where(
                            Snapshot.device_id.in_(device_ids)
                        )
                    )
                ).scalar_one_or_none()
        summaries.append(summary)
    return summaries


async def rack_summaries(db: AsyncSession, cluster_id: uuid.UUID) -> list[RackSummary]:
    racks = (
        (await db.execute(select(Rack).where(Rack.cluster_id == cluster_id).order_by(Rack.name)))
        .scalars().all()
    )
    summaries: list[RackSummary] = []
    for rack in racks:
        devices = (
            (await db.execute(select(Device).where(Device.rack_id == rack.id))).scalars().all()
        )
        summary = RackSummary.model_validate(rack)
        summary.device_count = len(devices)
        summary.online_count = sum(1 for d in devices if d.status == DeviceStatus.ONLINE)
        summary.offline_count = sum(1 for d in devices if d.status == DeviceStatus.OFFLINE)
        summary.warning_count = sum(1 for d in devices if d.status == DeviceStatus.WARNING)
        summaries.append(summary)
    return summaries

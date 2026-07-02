"""Device model: servers, switches, PDUs, KVMs registered by administrators."""
import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import TimestampedModel

if TYPE_CHECKING:
    from models.rack import Rack
    from models.snapshot import Snapshot


class DeviceType(str, enum.Enum):
    SERVER = "SERVER"
    SWITCH = "SWITCH"
    PDU = "PDU"
    KVM = "KVM"
    OTHER = "OTHER"


class DeviceStatus(str, enum.Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    WARNING = "WARNING"
    UNKNOWN = "UNKNOWN"


class Device(TimestampedModel):
    __tablename__ = "devices"

    rack_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("racks.id", ondelete="CASCADE"), nullable=False
    )
    hostname: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    device_type: Mapped[DeviceType] = mapped_column(
        Enum(DeviceType, name="device_type"), default=DeviceType.SERVER, nullable=False
    )
    vendor: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    management_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    ilo_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    ilo_username: Mapped[str | None] = mapped_column(String(128), nullable=True)
    ilo_password_encrypted: Mapped[str | None] = mapped_column(String(512), nullable=True)
    ssh_username: Mapped[str | None] = mapped_column(String(128), nullable=True)
    ssh_password_encrypted: Mapped[str | None] = mapped_column(String(512), nullable=True)
    snmp_community_encrypted: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[DeviceStatus] = mapped_column(
        Enum(DeviceStatus, name="device_status"), default=DeviceStatus.UNKNOWN, nullable=False
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    rack: Mapped["Rack"] = relationship(back_populates="devices", lazy="selectin")
    snapshots: Mapped[list["Snapshot"]] = relationship(
        back_populates="device", cascade="all, delete-orphan", lazy="noload"
    )

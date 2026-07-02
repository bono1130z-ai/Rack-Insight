"""Device schemas. Credentials are write-only: never returned by the API."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from models.device import DeviceStatus, DeviceType


class DeviceCreate(BaseModel):
    rack_id: uuid.UUID
    hostname: str = Field(min_length=1, max_length=255)
    display_name: str | None = None
    device_type: DeviceType = DeviceType.SERVER
    vendor: str | None = None
    model: str | None = None
    management_ip: str | None = None
    ilo_ip: str | None = None
    ilo_username: str | None = None
    ilo_password: str | None = None
    ssh_username: str | None = None
    ssh_password: str | None = None
    snmp_community: str | None = None
    u_position: int | None = Field(default=None, ge=1)
    height: int = Field(default=1, ge=1)


class DeviceUpdate(BaseModel):
    hostname: str | None = Field(default=None, min_length=1, max_length=255)
    display_name: str | None = None
    device_type: DeviceType | None = None
    vendor: str | None = None
    model: str | None = None
    management_ip: str | None = None
    ilo_ip: str | None = None
    ilo_username: str | None = None
    ilo_password: str | None = None
    ssh_username: str | None = None
    ssh_password: str | None = None
    snmp_community: str | None = None
    enabled: bool | None = None
    rack_id: uuid.UUID | None = None


class DeviceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rack_id: uuid.UUID
    hostname: str
    display_name: str | None
    device_type: DeviceType
    vendor: str | None
    model: str | None
    management_ip: str | None
    ilo_ip: str | None
    ilo_username: str | None
    ssh_username: str | None
    status: DeviceStatus
    enabled: bool
    created_at: datetime
    updated_at: datetime


class DeviceDetailResponse(DeviceResponse):
    health_score: int | None = None
    health_label: str | None = None
    last_refresh: datetime | None = None
    serial: str | None = None

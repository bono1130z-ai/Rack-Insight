"""Health Score (0-100) per specification:

Online(+30), Collector Success(+20), Power OK(+10), Fan OK(+10),
Storage OK(+10), Firmware OK(+10), Sensor OK(+10).
95-100 Healthy / 80-94 Warning / 0-79 Critical.
"""
from dataclasses import dataclass

from models import DeviceStatus, Firmware, Sensor, Snapshot, Storage

SCORE_ONLINE: int = 30
SCORE_COLLECTOR_SUCCESS: int = 20
SCORE_POWER_OK: int = 10
SCORE_FAN_OK: int = 10
SCORE_STORAGE_OK: int = 10
SCORE_FIRMWARE_OK: int = 10
SCORE_SENSOR_OK: int = 10

HEALTHY_MIN: int = 95
WARNING_MIN: int = 80

_OK_VALUES = {"ok", "healthy", "good", "normal", "enabled", None, ""}


@dataclass
class HealthScore:
    score: int
    label: str


def _all_ok(statuses: list[str | None]) -> bool:
    return all((status or "").lower() in _OK_VALUES for status in statuses)


def compute_health(
    status: DeviceStatus,
    snapshot: Snapshot | None,
    sensors: list[Sensor],
    storages: list[Storage],
    firmwares: list[Firmware],
) -> HealthScore:
    score = 0
    if status == DeviceStatus.ONLINE:
        score += SCORE_ONLINE
    if snapshot is not None and (
        snapshot.redfish_success or snapshot.ssh_success or snapshot.virsh_success
    ):
        score += SCORE_COLLECTOR_SUCCESS

    power_sensors = [s.status for s in sensors if (s.type or "").lower() == "power"]
    fan_sensors = [s.status for s in sensors if (s.type or "").lower() == "fan"]
    other_sensors = [
        s.status for s in sensors if (s.type or "").lower() not in ("power", "fan")
    ]

    if _all_ok(power_sensors):
        score += SCORE_POWER_OK
    if _all_ok(fan_sensors):
        score += SCORE_FAN_OK
    if _all_ok([s.health for s in storages]):
        score += SCORE_STORAGE_OK
    if _all_ok([f.health for f in firmwares]):
        score += SCORE_FIRMWARE_OK
    if _all_ok(other_sensors):
        score += SCORE_SENSOR_OK

    if score >= HEALTHY_MIN:
        label = "Healthy"
    elif score >= WARNING_MIN:
        label = "Warning"
    else:
        label = "Critical"
    return HealthScore(score=score, label=label)

"""Alert Engine (1.3.0).

Converts Events into Alerts and owns the alert lifecycle:

- One Event creates one Alert (recovery events create an already-RESOLVED
  INFO alert so the timeline stays complete without lingering noise).
- Hardware/Firmware alerts stay ACTIVE until an administrator resolves them.
- State alerts (offline / collector / credential / sensor / reachability)
  resolve automatically when the next collection shows normal state.
- Active state alerts are deduplicated per (device, category, subject) so a
  device that stays offline does not create a new alert every collection.

The Alert Engine also appends the immutable device-history entries that
correspond to each event (firmware upgrades, hardware replacements, collector
failures, recoveries) and to manual resolves.
"""
import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Alert, Device, Event
from models.operations import (
    ALERT_ACTIVE,
    ALERT_RESOLVED,
    AUTO_RESOLVE_CATEGORIES,
    EVENT_COLLECTOR_FAILED,
    EVENT_CREDENTIAL_FAILED,
    EVENT_DEVICE_OFFLINE,
    EVENT_DEVICE_RECOVERED,
    EVENT_FIRMWARE_CHANGED,
    EVENT_HARDWARE_CHANGED,
    EVENT_NETWORK_REACHABILITY_CHANGED,
    EVENT_SENSOR_RECOVERED,
    EVENT_SENSOR_THRESHOLD_EXCEEDED,
    HISTORY_COLLECTOR_FAILURE,
    HISTORY_DEVICE_RECOVERED,
    HISTORY_FIRMWARE_CHANGE,
    HISTORY_HARDWARE_CHANGE,
    HISTORY_MANUAL_RESOLVE,
)
from services.history_service import record_history
from utils.logging import get_logger

logger = get_logger(__name__)

# Categories a DeviceRecovered event resolves.
_STATE_CATEGORIES = (
    EVENT_DEVICE_OFFLINE,
    EVENT_COLLECTOR_FAILED,
    EVENT_CREDENTIAL_FAILED,
    EVENT_NETWORK_REACHABILITY_CHANGED,
)

_HISTORY_KIND_BY_EVENT = {
    EVENT_HARDWARE_CHANGED: HISTORY_HARDWARE_CHANGE,
    EVENT_FIRMWARE_CHANGED: HISTORY_FIRMWARE_CHANGE,
    EVENT_COLLECTOR_FAILED: HISTORY_COLLECTOR_FAILURE,
    EVENT_DEVICE_OFFLINE: HISTORY_COLLECTOR_FAILURE,
    EVENT_CREDENTIAL_FAILED: HISTORY_COLLECTOR_FAILURE,
    EVENT_DEVICE_RECOVERED: HISTORY_DEVICE_RECOVERED,
}


def _event_subject(event: Event) -> str | None:
    if event.details:
        try:
            details = json.loads(event.details)
            if isinstance(details, dict) and details.get("sensor"):
                return str(details["sensor"])
        except (ValueError, TypeError):
            pass
    return None


async def _active_alerts(
    db: AsyncSession, device_id: uuid.UUID, categories: tuple[str, ...] | None = None
) -> list[Alert]:
    query = select(Alert).where(
        Alert.device_id == device_id, Alert.status == ALERT_ACTIVE
    )
    if categories:
        query = query.where(Alert.category.in_(categories))
    return list((await db.execute(query)).scalars().all())


async def active_state_alert_context(
    db: AsyncSession, device_id: uuid.UUID
) -> tuple[bool, set[str]]:
    """(has active offline/collector/credential alert, active sensor subjects).

    Supplied to the Event Engine so it can emit recovery events without
    knowing how alerts are stored.
    """
    state = await _active_alerts(db, device_id, _STATE_CATEGORIES)
    sensors = await _active_alerts(db, device_id, (EVENT_SENSOR_THRESHOLD_EXCEEDED,))
    return bool(state), {a.subject for a in sensors if a.subject}


def _resolve(alert: Alert, resolved_by: str | None) -> None:
    alert.status = ALERT_RESOLVED
    alert.resolved_at = datetime.now(timezone.utc)
    alert.resolved_by = resolved_by


async def process_events(
    db: AsyncSession, device: Device, events: list[Event]
) -> list[Alert]:
    """Persist events, create/resolve alerts, and append history entries.

    Rows are added to the caller's session; the caller commits.
    """
    created: list[Alert] = []
    for event in events:
        db.add(event)
    await db.flush()  # events need ids for alert/history FKs

    for event in events:
        subject = _event_subject(event)

        # --- Recovery events: resolve their counterparts ----------------------
        if event.event_type == EVENT_DEVICE_RECOVERED:
            for alert in await _active_alerts(db, device.id, _STATE_CATEGORIES):
                _resolve(alert, "system")
        elif event.event_type == EVENT_SENSOR_RECOVERED:
            for alert in await _active_alerts(
                db, device.id, (EVENT_SENSOR_THRESHOLD_EXCEEDED,)
            ):
                if subject is None or alert.subject == subject:
                    _resolve(alert, "system")
        elif event.event_type == EVENT_DEVICE_OFFLINE:
            # Escalation: offline supersedes plain collector-failure alerts.
            for alert in await _active_alerts(db, device.id, (EVENT_COLLECTOR_FAILED,)):
                _resolve(alert, "system")

        # --- Dedupe active state alerts ---------------------------------------
        is_recovery = event.event_type in (
            EVENT_DEVICE_RECOVERED,
            EVENT_SENSOR_RECOVERED,
        )
        if event.event_type in AUTO_RESOLVE_CATEGORIES:
            duplicates = [
                a
                for a in await _active_alerts(db, device.id, (event.event_type,))
                if a.subject == subject
            ]
            if duplicates:
                continue  # identical condition already alerting

        alert = Alert(
            event_id=event.id,
            device_id=device.id,
            category=event.event_type,
            severity=event.severity,
            status=ALERT_RESOLVED if is_recovery else ALERT_ACTIVE,
            subject=subject,
            message=event.message,
            details=event.details,
            auto_resolve=event.event_type in AUTO_RESOLVE_CATEGORIES,
        )
        if is_recovery:
            alert.resolved_at = datetime.now(timezone.utc)
            alert.resolved_by = "system"
        db.add(alert)
        created.append(alert)

        # --- Immutable history -------------------------------------------------
        kind = _HISTORY_KIND_BY_EVENT.get(event.event_type)
        if kind is not None:
            details = None
            if event.details:
                try:
                    details = json.loads(event.details)
                except (ValueError, TypeError):
                    details = None
            record_history(
                db, device.id, kind, event.message, details=details, event_id=event.id
            )

    if created:
        await db.flush()
        logger.info(
            "Alert engine: %d alert(s) for device %s", len(created), device.hostname
        )
    return created


async def resolve_alert_manually(
    db: AsyncSession, alert: Alert, resolved_by: str
) -> Alert:
    """Administrator resolve (hardware/firmware alerts, or forcing a state
    alert closed). Recorded in the device history."""
    _resolve(alert, resolved_by)
    record_history(
        db,
        alert.device_id,
        HISTORY_MANUAL_RESOLVE,
        f"Alert resolved by {resolved_by}: {alert.message}",
        details={"alert_id": str(alert.id), "category": alert.category},
        event_id=alert.event_id,
    )
    return alert

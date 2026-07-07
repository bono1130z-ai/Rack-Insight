"""Audit trail for administrative changes (F10).

record_audit adds an AuditLog row to the caller's session; it is committed
together with the change itself. Secrets are never serialized.
"""
import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from models import AuditLog, User
from models.base import TimestampedModel

ACTION_CREATE = "CREATE"
ACTION_UPDATE = "UPDATE"
ACTION_DELETE = "DELETE"

# Never write these column values into the audit log.
_SECRET_COLUMNS = {
    "password_hash",
    "password_encrypted",
    "ilo_password_encrypted",
    "ssh_password_encrypted",
    "snmp_community_encrypted",
}
_SKIP_COLUMNS = {"created_at", "updated_at"}


def snapshot_entity(entity: TimestampedModel) -> dict[str, Any]:
    """Serializable snapshot of a model row, secrets redacted."""
    data: dict[str, Any] = {}
    for column in entity.__table__.columns:
        if column.name in _SKIP_COLUMNS:
            continue
        value = getattr(entity, column.name)
        if column.name in _SECRET_COLUMNS:
            data[column.name] = "***" if value else None
        else:
            data[column.name] = str(value) if value is not None else None
    return data


def record_audit(
    db: AsyncSession,
    actor: User,
    action: str,
    entity_type: str,
    entity_name: str | None,
    entity_id: Any = None,
    old_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=actor.id,
            username=actor.username,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            old_value=json.dumps(old_value, ensure_ascii=False) if old_value else None,
            new_value=json.dumps(new_value, ensure_ascii=False) if new_value else None,
        )
    )

"""Plugin contract & API schemas (Plugin Architecture Foundation).

``PluginManifest`` is the standard contract a plugin returns from
``GET /plugin/manifest``. It accepts camelCase (the on-the-wire convention in
the spec, e.g. ``displayName``, ``apiVersion``, ``healthEndpoint``) and, thanks
to ``populate_by_name``, snake_case too — so plugin authors can use either.
"""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


def _camel(field_name: str) -> str:
    head, *tail = field_name.split("_")
    return head + "".join(word.capitalize() for word in tail)


class PluginManifest(BaseModel):
    """The contract a plugin advertises. Forward-compatible: unknown fields are
    ignored so newer plugins never break an older Core."""

    model_config = ConfigDict(alias_generator=_camel, populate_by_name=True, extra="ignore")

    name: str = Field(min_length=1, max_length=64)
    display_name: str = Field(min_length=1, max_length=128)
    version: str = Field(default="0.0.0", max_length=32)
    api_version: str = Field(default="v1", max_length=16)
    description: str | None = None
    health_endpoint: str = "/healthz"
    ready_endpoint: str = "/readyz"
    manifest_endpoint: str = "/plugin/manifest"
    # Reserved for future dynamic extension (not consumed by this patch).
    routes: list[dict] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    menus: list[dict] = Field(default_factory=list)


# --- Core API request/response ------------------------------------------------
class PluginCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    endpoint: str = Field(min_length=1, max_length=255)
    display_name: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=2000)
    enabled: bool = True


class PluginUpdate(BaseModel):
    endpoint: str | None = Field(default=None, min_length=1, max_length=255)
    display_name: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=2000)
    enabled: bool | None = None


class PluginResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    display_name: str
    description: str | None
    version: str | None
    api_version: str
    endpoint: str
    enabled: bool
    managed_by_config: bool
    status: str
    last_health_check: datetime | None
    last_success_at: datetime | None
    last_failure_at: datetime | None
    failure_reason: str | None
    created_at: datetime
    updated_at: datetime

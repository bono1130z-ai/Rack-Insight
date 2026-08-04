"""Plugin registry + proxy API (Plugin Architecture Foundation).

- Registry CRUD and health-check: manage the plugins the Core knows about.
- Minimal REST proxy (GET/POST): ``/api/plugins/{name}/proxy/{path}`` forwards a
  request to the plugin's endpoint after the Core has authenticated the user and
  checked the ``plugin.proxy`` permission — plugins never handle login
  themselves and are never reached directly by the browser.

A plugin that is missing, disabled, or unreachable yields a clear 404/503; it
never turns into a Core 500 or a hung request.
"""
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import RequirePermission
from database import get_db
from models import Plugin, User
from models.plugin import PLUGIN_STATUS_DISABLED
from schemas.plugin import PluginCreate, PluginResponse, PluginUpdate
from services import plugin_client, plugin_registry
from utils.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/plugins", tags=["plugins"])


async def _get_plugin(db: AsyncSession, plugin_id: uuid.UUID) -> Plugin:
    plugin = (
        await db.execute(select(Plugin).where(Plugin.id == plugin_id))
    ).scalar_one_or_none()
    if plugin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plugin not found")
    return plugin


@router.get(
    "",
    response_model=list[PluginResponse],
    dependencies=[Depends(RequirePermission("plugin.view"))],
)
async def list_plugins(db: AsyncSession = Depends(get_db)) -> list[Plugin]:
    return await plugin_registry.list_plugins(db)


@router.get(
    "/{plugin_id}",
    response_model=PluginResponse,
    dependencies=[Depends(RequirePermission("plugin.view"))],
)
async def get_plugin(
    plugin_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> Plugin:
    return await _get_plugin(db, plugin_id)


@router.post("", response_model=PluginResponse, status_code=status.HTTP_201_CREATED)
async def create_plugin(
    payload: PluginCreate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(RequirePermission("plugin.manage")),
) -> Plugin:
    if await plugin_registry.get_by_name(db, payload.name) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Plugin name already exists"
        )
    return await plugin_registry.register_plugin(db, actor, payload)


@router.patch("/{plugin_id}", response_model=PluginResponse)
async def update_plugin(
    plugin_id: uuid.UUID,
    payload: PluginUpdate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(RequirePermission("plugin.manage")),
) -> Plugin:
    plugin = await _get_plugin(db, plugin_id)
    return await plugin_registry.update_plugin(db, actor, plugin, payload)


@router.delete("/{plugin_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plugin(
    plugin_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(RequirePermission("plugin.manage")),
) -> None:
    plugin = await _get_plugin(db, plugin_id)
    await plugin_registry.delete_plugin(db, actor, plugin)


@router.post(
    "/{plugin_id}/health-check",
    response_model=PluginResponse,
    dependencies=[Depends(RequirePermission("plugin.view"))],
)
async def health_check(
    plugin_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> Plugin:
    plugin = await _get_plugin(db, plugin_id)
    return await plugin_registry.refresh_health(db, plugin)


# --------------------------------------------------------------------------- #
# Minimal REST proxy (GET / POST)
# --------------------------------------------------------------------------- #
async def _proxy(
    db: AsyncSession, plugin_name: str, path: str, method: str, request: Request,
    json_body: Any = None,
) -> Response:
    plugin = await plugin_registry.get_by_name(db, plugin_name)
    if plugin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plugin not found")
    if not plugin.enabled or plugin.status == PLUGIN_STATUS_DISABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Plugin is disabled"
        )
    try:
        result = await plugin_client.proxy_request(
            method, plugin.endpoint, path,
            params=dict(request.query_params),
            json_body=json_body,
        )
    except plugin_client.PluginUnavailable as exc:
        # Never leak the Core token to the plugin, and never 500 on a dead plugin.
        logger.info("Proxy to plugin %s failed: %s", plugin_name, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Plugin '{plugin_name}' is unavailable",
        ) from exc
    return Response(
        content=result.content,
        status_code=result.status_code,
        media_type=result.media_type,
    )


@router.get("/{plugin_name}/proxy/{path:path}")
async def proxy_get(
    plugin_name: str,
    path: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequirePermission("plugin.proxy")),
) -> Response:
    return await _proxy(db, plugin_name, path, "GET", request)


@router.post("/{plugin_name}/proxy/{path:path}")
async def proxy_post(
    plugin_name: str,
    path: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequirePermission("plugin.proxy")),
    body: Any = Body(default=None),
) -> Response:
    return await _proxy(db, plugin_name, path, "POST", request, json_body=body)

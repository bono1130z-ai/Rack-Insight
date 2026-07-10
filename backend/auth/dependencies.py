"""FastAPI auth dependencies: current user resolution and admin guard."""
import uuid

import jwt as pyjwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.security import TOKEN_TYPE_ACCESS, decode_token
from database import get_db
from models import User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    try:
        payload = decode_token(credentials.credentials, TOKEN_TYPE_ACCESS)
        user_id = uuid.UUID(str(payload.get("sub")))
    except (pyjwt.InvalidTokenError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.enabled:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or disabled"
        )
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required"
        )
    return user


def RequirePermission(permission: str):
    """Centralized authorization guard.

    Returns a FastAPI dependency that resolves the current user, checks the
    given business-action permission through the RBAC chain, and raises HTTP 403
    when it is missing. Use as ``actor: User = Depends(RequirePermission("x.y"))``
    so the authenticated user is still available to the handler.
    """

    async def _dependency(
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        # Imported lazily to avoid a circular import (services -> models -> ...).
        from services.rbac_service import user_has_permission

        if not await user_has_permission(db, user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission}",
            )
        return user

    return _dependency

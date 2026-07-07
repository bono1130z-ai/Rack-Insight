"""User management endpoints (admin only)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import require_admin
from auth.security import hash_password
from database import get_db
from models import User
from schemas.user import UserCreate, UserResponse, UserUpdate
from services.audit_service import (
    ACTION_CREATE,
    ACTION_DELETE,
    ACTION_UPDATE,
    record_audit,
    snapshot_entity,
)
from utils.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(require_admin)])


@router.get("", response_model=list[UserResponse])
async def list_users(
    page: int | None = None,
    page_size: int | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    """All users by default; pass page/page_size for server-side pagination."""
    query = select(User).order_by(User.username)
    if page is not None and page_size is not None:
        query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    try:
        existing = await db.execute(select(User).where(User.username == payload.username))
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Username already exists"
            )
        user = User(
            username=payload.username,
            password_hash=hash_password(payload.password),
            role=payload.role,
        )
        db.add(user)
        await db.flush()
        record_audit(
            db, admin, ACTION_CREATE, "user", user.username, user.id,
            new_value=snapshot_entity(user),
        )
        await db.commit()
        await db.refresh(user)
        logger.info("User %s created", user.username)
        return user
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("User creation failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="User creation failed"
        ) from exc


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    old = snapshot_entity(user)
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
    if payload.role is not None:
        user.role = payload.role
    if payload.enabled is not None:
        user.enabled = payload.enabled
    record_audit(
        db, admin, ACTION_UPDATE, "user", user.username, user.id,
        old_value=old, new_value=snapshot_entity(user),
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    record_audit(
        db, admin, ACTION_DELETE, "user", user.username, user.id,
        old_value=snapshot_entity(user),
    )
    await db.delete(user)
    await db.commit()

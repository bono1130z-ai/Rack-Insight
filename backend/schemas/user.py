"""User management schemas (admin only)."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from models.user import UserRole


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.USER


class UserUpdate(BaseModel):
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role: UserRole | None = None
    enabled: bool | None = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    role: UserRole
    enabled: bool
    last_login: datetime | None
    created_at: datetime
    updated_at: datetime

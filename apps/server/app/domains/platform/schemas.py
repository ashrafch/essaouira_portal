from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict


class AuthLoginRequest(BaseModel):
    username: str
    password: str
    tenant_id: str | None = None


class AuthLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str
    tenant_id: str


class UserRole(str, Enum):
    owner = "owner"
    manager = "manager"
    operator = "operator"
    viewer = "viewer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: UserRole
    is_active: bool
    tenant_id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class UserCreate(BaseModel):
    username: str
    password: str
    role: UserRole = UserRole.viewer
    is_active: bool = True


class UserUpdate(BaseModel):
    username: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserResetPassword(BaseModel):
    new_password: str

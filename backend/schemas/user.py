from datetime import datetime

from backend.models.user import UserRole
from pydantic import BaseModel, ConfigDict, EmailStr
from .common import StrongPassword


class UserBase(BaseModel):
    email: EmailStr
    role: UserRole | None = None
    is_active: bool | None = True


class UserCreate(UserBase):
    password: StrongPassword

class UserUpdate(BaseModel):
    email: EmailStr | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserResponse(UserBase):
    user_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AccountStateResponse(UserResponse):
    is_first_login: bool
    is_registration_pending: bool

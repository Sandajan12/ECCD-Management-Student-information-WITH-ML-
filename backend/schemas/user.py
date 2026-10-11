from datetime import datetime

from backend.models.user import UserRole
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from .common import StrongPassword


class UserBase(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    email: EmailStr
    role: UserRole | None = None
    is_active: bool | None = True


class UserCreate(UserBase):
    password: StrongPassword

class UserUpdate(BaseModel):
    username: str | None = None
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

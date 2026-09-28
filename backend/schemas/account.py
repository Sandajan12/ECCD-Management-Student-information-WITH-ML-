from pydantic import BaseModel, EmailStr, Field
from typing import Optional

class VerifyPasswordRequest(BaseModel):
    currentPassword: str

class AccountUpdateRequest(BaseModel):
    currentPassword: str
    newEmail: Optional[str] = None
    newPassword: Optional[str] = None
    otp: Optional[str] = None

class SendOtpRequest(BaseModel):
    email: EmailStr

from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional
from .common import ApiModel, LoginEmail, OtpCode, StrongPassword

class VerifyPasswordRequest(BaseModel):
    currentPassword: str

class AccountUpdateRequest(BaseModel):
    currentPassword: str
    newEmail: LoginEmail | None = None
    newPassword: StrongPassword | None = None
    confirmPassword: str | None = None
    otp: Optional[str] = None
    challengeToken: str | None = Field(default=None, max_length=3000)

    @model_validator(mode="after")
    def confirmation_matches(self):
        if self.newPassword and self.confirmPassword is not None and self.newPassword != self.confirmPassword:
            raise ValueError("Passwords do not match")
        return self

class SendOtpRequest(BaseModel):
    email: EmailStr
    currentPassword: str | None = None

class ChallengeResult(BaseModel):
    message: str
    challengeToken: str | None = None
    email: EmailStr | None = None
    success: bool = True


class PasswordChangeRequest(ApiModel):
    oldPassword: str = Field(min_length=1)


class PasswordChangeVerify(ApiModel):
    newPassword: StrongPassword
    confirmPassword: str | None = None
    oldPassword: str | None = None
    email: LoginEmail | None = None
    otp: OtpCode | None = None
    challengeToken: str | None = Field(default=None, max_length=3000)

    @model_validator(mode="after")
    def confirmation_matches(self):
        if self.confirmPassword is not None and self.newPassword != self.confirmPassword:
            raise ValueError("Passwords do not match")
        return self

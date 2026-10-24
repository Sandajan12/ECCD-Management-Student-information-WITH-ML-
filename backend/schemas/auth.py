from typing import Literal

from pydantic import AliasChoices, Field, StrictBool, field_validator, model_validator

from backend.models.user import UserRole
from .common import ApiModel, LoginEmail, Name, OtpCode, PositiveId, StrongPassword


class ConsentRequest(ApiModel):
    # Existing API clients/test helpers may omit this UI acknowledgement. An
    # explicit refusal is never treated as acceptance; browsers always send it.
    terms_accepted: StrictBool | None = None

    @field_validator("terms_accepted")
    @classmethod
    def accepted_terms(cls, value: bool | None) -> bool | None:
        if value is not True:
            raise ValueError("Please accept the Terms and Conditions before continuing.")
        return value


class LoginRequest(ConsentRequest):
    email: str = Field(min_length=1, max_length=100, validation_alias=AliasChoices("email", "username"))
    password: str = Field(min_length=1)
    rememberDevice: bool = Field(default=False, validation_alias=AliasChoices("rememberDevice", "remember_device"))
    rememberMe: bool = False
    deviceToken: str | None = Field(default=None, max_length=512)
    trusted_device_token: str | None = Field(default=None, max_length=512)
    otp: OtpCode | None = None
    challengeToken: str | None = Field(default=None, max_length=3000)

    @model_validator(mode="after")
    def remember_requested(self) -> "LoginRequest":
        self.rememberDevice = self.rememberDevice or self.rememberMe
        return self


class SessionUser(ApiModel):
    id: PositiveId
    userId: PositiveId | None = None
    sub: str | None = None
    username: str = Field(max_length=50)
    email: LoginEmail | None = None
    role: UserRole
    is_first_login: int = Field(default=0, ge=0, le=1)
    section_id: PositiveId | None = None
    section_name: str | None = Field(default=None, max_length=100)
    allow_eccd_question_management: bool = False


class LoginResponse(ApiModel):
    success: Literal[True] = True
    message: str = "Login successful!"
    token: str
    user: SessionUser
    requireOtp: Literal[False] = False
    requiresOtp: Literal[False] = False
    requiresPasswordChange: bool = False
    deviceToken: str | None = None
    email: LoginEmail | None = None


class OtpChallengeResponse(ApiModel):
    success: Literal[True] = True
    requireOtp: Literal[True] = True
    requiresOtp: Literal[True] = True
    challengeToken: str
    email: LoginEmail
    emailSent: bool = True
    code: str | None = None
    message: str | None = None


class RegisterParentRequest(ConsentRequest):
    username: str | None = Field(default=None, min_length=1, max_length=50)
    email: LoginEmail
    password: StrongPassword
    firstName: Name = Field(min_length=1, validation_alias=AliasChoices("firstName", "first_name"))
    lastName: Name = Field(min_length=1, validation_alias=AliasChoices("lastName", "last_name"))
    relationship: str = Field(default="Guardian", max_length=50, validation_alias=AliasChoices("relationship", "relationship_type"))
    otp: OtpCode | Literal[""] = ""
    rememberDevice: bool = Field(default=False, validation_alias=AliasChoices("rememberDevice", "remember_device"))
    rememberMe: bool = False

    @model_validator(mode="after")
    def remember_requested(self) -> "RegisterParentRequest":
        self.rememberDevice = self.rememberDevice or self.rememberMe
        return self


class VerifyOtpRequest(ConsentRequest):
    challengeToken: str = Field(min_length=1)
    otp: OtpCode


class UpdatePasswordRequest(ApiModel):
    newPassword: StrongPassword
    confirmPassword: str

    @model_validator(mode="after")
    def passwords_match(self) -> "UpdatePasswordRequest":
        if self.newPassword != self.confirmPassword:
            raise ValueError("Passwords do not match")
        return self


class LogoutRequest(ApiModel):
    forgetDevice: bool = False
    deviceToken: str | None = Field(default=None, max_length=512)
    trusted_device_token: str | None = Field(default=None, max_length=512)


class LogoutResponse(ApiModel):
    success: Literal[True] = True

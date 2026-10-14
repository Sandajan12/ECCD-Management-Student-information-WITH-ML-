"""Shared Pydantic V2 validation for the migrated functional contracts."""

import re
import unicodedata
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, EmailStr, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, hide_input_in_errors=True)


def reject_boolean(value: object) -> object:
    if isinstance(value, bool):
        raise ValueError("An integer identifier is required")
    return value


def validate_password(value: str) -> str:
    if len(value) < 8 or not all(re.search(pattern, value) for pattern in (r"[A-Z]", r"[a-z]", r"[0-9]")):
        raise ValueError("Password requires at least 8 characters, uppercase, lowercase, and a number")
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password must not exceed 72 UTF-8 bytes")
    return value


def validate_school_year(value: str) -> str:
    start, end = map(int, value.split("-"))
    if end != start + 1:
        raise ValueError("School year must contain two consecutive years")
    return value


def trim_text(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


def validate_person_name(value: str) -> str:
    if value and (not any(unicodedata.category(char).startswith("L") for char in value)
                  or any(not unicodedata.category(char).startswith(("L", "M")) and char not in " .'-" for char in value)):
        raise ValueError("Names may contain only letters, spaces, hyphens, apostrophes and periods")
    return value


def validate_contact(value: str) -> str:
    if value and not re.fullmatch(r"09[0-9]{9}", value):
        raise ValueError("Contact number must begin with 09 and contain exactly 11 digits")
    return value


PositiveId = Annotated[int, BeforeValidator(reject_boolean), Field(gt=0, le=2147483647)]
Lrn = Annotated[str, Field(strict=True, pattern=r"^[0-9]{12}$")]
Name = Annotated[str, BeforeValidator(trim_text), Field(strict=True, max_length=100), AfterValidator(validate_person_name)]
EmergencyContact = Annotated[str, Field(strict=True, max_length=20), AfterValidator(validate_contact)]
LoginEmail = Annotated[EmailStr, Field(max_length=100)]
StrongPassword = Annotated[str, AfterValidator(validate_password)]
SchoolYear = Annotated[str, Field(pattern=r"^[0-9]{4}-[0-9]{4}$"), AfterValidator(validate_school_year)]
OpeningMonth = Annotated[int, BeforeValidator(reject_boolean), Field(ge=1, le=12)]
OtpCode = Annotated[str, Field(strict=True, pattern=r"^[0-9]{6}$")]


class MessageResult(ApiModel):
    message: str


class ParentPermissions(ApiModel):
    allow_parent_view_student_info: bool = True
    allow_parent_view_eccd_pre: bool = False
    allow_parent_view_eccd_mid: bool = False
    allow_parent_view_eccd_post: bool = False
    allow_parent_edit_student_info: bool = True
    allow_parent_edit_home_based_eccd: bool = False

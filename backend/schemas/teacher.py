from typing import Annotated

from pydantic import AfterValidator, AliasChoices, BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from .common import ApiModel, LoginEmail, Name, ParentPermissions, PositiveId
from backend.models.section_teacher import TeacherRole


def validate_temporary_password(value: str) -> str:
    if len(value) < 8 or not value.strip():
        raise ValueError("Temporary password requires at least 8 characters")
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password must not exceed 72 UTF-8 bytes")
    return value


TemporaryPassword = Annotated[str, AfterValidator(validate_temporary_password)]


class TeacherBase(BaseModel):
    allow_parent_predictions: bool = False
    first_name: Name | None = None
    last_name: Name | None = None
    employee_id: str | None = None
    class_name: str | None = None
    allow_parent_view_student_info: bool | None = True
    allow_parent_view_eccd_pre: bool | None = False
    allow_parent_view_eccd_mid: bool | None = False
    allow_parent_view_eccd_post: bool | None = False
    allow_parent_view_eccd_marks: bool = False
    allow_parent_edit_student_info: bool | None = True
    allow_parent_edit_home_based_eccd: bool | None = False
    allow_parent_view: bool | None = True
    allow_parent_edit: bool | None = False
    allow_parent_home_based_edit: bool | None = False
    allow_eccd_question_management: bool | None = False


class TeacherCreate(TeacherBase):
    user_id: int | None = None


class TeacherUpdate(ApiModel):
    first_name: Name | None = Field(default=None, validation_alias=AliasChoices("first_name", "firstName", "fullName"))
    last_name: Name | None = Field(default=None, validation_alias=AliasChoices("last_name", "lastName"))
    employee_id: str | None = Field(default=None, max_length=50, validation_alias=AliasChoices("employee_id", "employeeId"))
    class_name: str | None = Field(default=None, max_length=100)
    section_id: PositiveId | None = Field(default=None, validation_alias=AliasChoices("section_id", "sectionId"))
    email: LoginEmail | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def require_nonblank_name(cls, value: str | None) -> str:
        if not value:
            raise ValueError("First and last names are required")
        return value

    @field_validator("class_name", "email", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("employee_id", mode="before")
    @classmethod
    def normalize_employee_id(cls, value: object) -> object:
        return (value.strip() or None) if isinstance(value, str) else value


class TeacherResponse(TeacherBase):
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    teacher_id: int
    user_id: int | None

    model_config = ConfigDict(from_attributes=True)


class TeacherCreateWithUser(TeacherBase):
    email: EmailStr
    password: TemporaryPassword


class TeacherUpdateAccess(BaseModel):
    allow_parent_predictions: bool = False
    allow_parent_view_eccd_marks: bool = False
    allow_parent_view_student_info: bool | None = None
    allow_parent_view_eccd_pre: bool | None = None
    allow_parent_view_eccd_mid: bool | None = None
    allow_parent_view_eccd_post: bool | None = None
    allow_parent_edit_student_info: bool | None = None
    allow_parent_edit_home_based_eccd: bool | None = None
    allow_parent_view: bool | None = None
    allow_parent_edit: bool | None = None
    allow_parent_home_based_edit: bool | None = None


class TeacherPermissionUpdate(BaseModel):
    allow_eccd_question_management: bool


class AssignTeacherSectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    teacher_id: PositiveId | None = Field(default=None, validation_alias=AliasChoices("teacher_id", "adviser_teacher_id"))
    # Accept the former adviser value for queued clients; other roles fail 422.
    role: TeacherRole | None = None


class TeacherProvisionRequest(TeacherUpdate):
    email: LoginEmail
    password: TemporaryPassword = Field(validation_alias=AliasChoices("initial_password", "password"))
    first_name: Name = Field(min_length=1, validation_alias=AliasChoices("first_name", "firstName", "fullName"))
    last_name: Name = Field(min_length=1, validation_alias=AliasChoices("last_name", "lastName"))
    employee_id: str | None = Field(default=None, max_length=50, validation_alias=AliasChoices("employee_id", "employeeId"))
    section_id: PositiveId | None = Field(default=None, validation_alias=AliasChoices("section_id", "sectionId"))
    class_name: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def require_section(self) -> "TeacherProvisionRequest":
        if self.section_id is None and not self.class_name:
            raise ValueError("A section or class is required")
        return self


class ParentPermissionUpdate(ApiModel):
    allow_parent_predictions: bool = False
    allow_parent_view_eccd_marks: bool = False
    allow_parent_view_student_info: bool | None = None
    allow_parent_view_eccd_pre: bool | None = None
    allow_parent_view_eccd_mid: bool | None = None
    allow_parent_view_eccd_post: bool | None = None
    allow_parent_edit_student_info: bool | None = None
    allow_parent_edit_home_based_eccd: bool | None = None
    model_config = ConfigDict(extra="forbid")


class TeacherAccessResponse(ParentPermissions):
    allow_eccd_question_management: bool = False
    section_id: PositiveId | None = None
    section_name: str | None = Field(default=None, max_length=100)
    class_name: str | None = None


class TeacherSettingsUpdate(ParentPermissionUpdate):
    """Partial settings updates preserve omitted permissions for older clients."""


class TeacherSettingsResponse(TeacherAccessResponse):
    pass


class TeacherProvisionResponse(ApiModel):
    success: bool = True
    message: str
    user_id: PositiveId
    teacher_id: PositiveId


class TeacherPermissionResponse(ApiModel):
    message: str
    teacher_id: PositiveId
    allow_eccd_question_management: bool


class AssignmentResponse(ApiModel):
    message: str
    section_id: PositiveId
    archived_teacher: str | None = None


class TransferResponse(ApiModel):
    message: str
    transferred_count: int = Field(ge=0)

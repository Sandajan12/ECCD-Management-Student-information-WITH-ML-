from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field, model_validator
from .common import ApiModel, LoginEmail, Name, ParentPermissions, PositiveId, StrongPassword
from backend.models.section_teacher import TeacherRole


class TeacherBase(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    employee_id: str | None = None
    class_name: str | None = None
    allow_parent_view_student_info: bool | None = True
    allow_parent_view_eccd_pre: bool | None = False
    allow_parent_view_eccd_mid: bool | None = False
    allow_parent_view_eccd_post: bool | None = False
    allow_parent_edit_student_info: bool | None = True
    allow_parent_edit_home_based_eccd: bool | None = False
    allow_parent_view: bool | None = True
    allow_parent_edit: bool | None = False
    allow_parent_home_based_edit: bool | None = False
    allow_eccd_question_management: bool | None = False


class TeacherCreate(TeacherBase):
    user_id: int | None = None


class TeacherUpdate(ApiModel):
    first_name: Name | None = None
    last_name: Name | None = None
    employee_id: str | None = Field(default=None, max_length=50)
    class_name: str | None = Field(default=None, max_length=50)
    username: str | None = Field(default=None, min_length=1, max_length=50)
    email: LoginEmail | None = None


class TeacherResponse(TeacherBase):
    teacher_id: int
    user_id: int | None

    model_config = ConfigDict(from_attributes=True)


class TeacherCreateWithUser(TeacherBase):
    email: EmailStr
    password: StrongPassword


class TeacherUpdateAccess(BaseModel):
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
    teacher_id: PositiveId | None = None
    role: TeacherRole | None = None


class TeacherProvisionRequest(ApiModel):
    email: EmailStr = Field(max_length=100)
    password: StrongPassword = Field(validation_alias=AliasChoices("initial_password", "password"))
    username: str | None = Field(default=None, max_length=50)
    first_name: Name = Field(validation_alias=AliasChoices("first_name", "fullName"))
    last_name: Name = ""
    employee_id: str | None = Field(default=None, max_length=50, validation_alias=AliasChoices("employee_id", "employeeId"))
    section_id: PositiveId | None = Field(default=None, validation_alias=AliasChoices("section_id", "sectionId"))
    class_name: str | None = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def derive_username(self) -> "TeacherProvisionRequest":
        self.username = self.username or str(self.email)
        if len(self.username) > 50:
            raise ValueError("Teacher username must not exceed 50 characters; email-derived usernames use this limit")
        return self


class ParentPermissionUpdate(ApiModel):
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
    section_name: Name | None = None
    class_name: str | None = None


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

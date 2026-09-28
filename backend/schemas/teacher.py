from pydantic import BaseModel, ConfigDict, EmailStr


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


class TeacherUpdate(TeacherBase):
    pass


class TeacherResponse(TeacherBase):
    teacher_id: int
    user_id: int | None

    model_config = ConfigDict(from_attributes=True)


class TeacherCreateWithUser(TeacherBase):
    email: EmailStr
    password: str


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
    teacher_id: int | None = None
    role: str | None = None

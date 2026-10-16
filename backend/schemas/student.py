from datetime import date, datetime
from typing import Literal

from backend.models.student import Gender, Handedness
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator
from .common import ApiModel, EmergencyContact, Lrn, Name, PositiveId, SchoolYear


class StudentBase(BaseModel):
    first_name: Name | None = None
    middle_name: Name | None = None
    last_name: Name | None = None
    date_of_birth: date | None = None
    gender: Gender | None = None
    section_id: PositiveId | None = None
    section_name: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=100)
    handedness: Handedness | None = None
    num_of_siblings: int | None = Field(default=None, ge=0)
    birth_order: str | None = Field(default=None, max_length=50)
    emergency_contact: EmergencyContact | None = Field(default=None, validation_alias=AliasChoices("emergency_contact", "emergencyContactNumber", "emergency_contact_number", "guardian_name"))
    is_active: bool | None = True
    school_year: SchoolYear | None = None

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("gender", "handedness", mode="before")
    @classmethod
    def normalize_enum(cls, value: object) -> object:
        return value.strip().title() if isinstance(value, str) else value


class StudentCreate(StudentBase):
    lrn_number: Lrn


class StudentUpdate(StudentBase):
    lrn_number: Lrn | None = None
    father_name: Name | None = None
    father_age: int | None = Field(default=None, ge=0)
    father_occ: str | None = Field(default=None, max_length=50)
    father_educ: str | None = Field(default=None, max_length=20)

    mother_name: Name | None = None
    mother_age: int | None = Field(default=None, ge=0)
    mother_occ: str | None = Field(default=None, max_length=50)
    mother_educ: str | None = Field(default=None, max_length=20)

    legal_guardian_name: Name | None = None
    legal_guardian_age: int | None = Field(default=None, ge=0)
    legal_guardian_occ: str | None = Field(default=None, max_length=50)
    legal_guardian_educ: str | None = Field(default=None, max_length=20)

    model_config = ConfigDict(extra="ignore")

    @field_validator("father_age", "mother_age", "legal_guardian_age", "num_of_siblings", mode="before")
    @classmethod
    def coerce_empty_to_none(cls, v: object) -> object:
        if v is None or v == "" or str(v).strip() == "":
            return None
        return v


class StudentResponse(StudentBase):
    first_name: str | None = Field(default=None, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    emergency_contact: str | None = Field(default=None, max_length=20)
    lrn_number: str

    model_config = ConfigDict(from_attributes=True)


class StudentWithAgeResponse(StudentResponse):
    decimal_age: float | None = None


class FamilyAccessCreate(BaseModel):
    student_lrn: Lrn | None = None
    lrn_number: Lrn | None = None
    relationship_type: str | None = Field(default="Guardian", max_length=50)

    model_config = ConfigDict(extra="ignore")

    @property
    def target_lrn(self) -> str:
        return self.student_lrn or self.lrn_number or ""


class StudentTransferRequest(BaseModel):
    lrn_numbers: list[Lrn] = Field(min_length=1, max_length=1000)
    new_section_id: PositiveId


class StudentRecordResponse(StudentBase):
    """ID-based response for Phase 2; never serializes the raw LRN or ciphertext."""
    first_name: str | None = Field(default=None, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    emergency_contact: str | None = Field(default=None, max_length=20)
    student_id: PositiveId
    lrn_last4: str = Field(pattern=r"^[0-9]{4}$")
    decimal_age: float | None = None
    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def masked_lrn(self) -> str:
        from backend.utils.lrn import mask_lrn
        return mask_lrn(self.lrn_last4)


class StudentIdTransferRequest(ApiModel):
    student_ids: list[PositiveId] = Field(min_length=1, max_length=1000)
    new_section_id: PositiveId

    @model_validator(mode="after")
    def unique_ids(self) -> "StudentIdTransferRequest":
        if len(self.student_ids) != len(set(self.student_ids)):
            raise ValueError("Student identifiers must not be repeated")
        return self


class FamilyAccessIdCreate(ApiModel):
    student_id: PositiveId
    relationship_type: str = Field(default="Guardian", max_length=50)


class FamilyAccessResponse(FamilyAccessIdCreate):
    id: PositiveId
    parent_id: PositiveId
    date_linked: datetime


class EnrollmentRequest(StudentCreate):
    first_name: Name = Field(min_length=1)
    last_name: Name = Field(min_length=1)
    date_of_birth: date
    gender: Gender

    @field_validator("first_name", "last_name")
    @classmethod
    def nonempty_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Student names must not be empty")
        return value.strip()

    @field_validator("gender", mode="before")
    @classmethod
    def normalize_gender(cls, value: object) -> object:
        return value.title() if isinstance(value, str) else value


class LinkedGuardian(ApiModel):
    fullname: str | None
    relationship: str | None
    age: int | None
    occupation: str | None
    educational_attainment: str | None


class StudentPublicResponse(StudentRecordResponse):
    lrn_number: str
    lrn: str
    parent_names: str | None = None
    profile_completeness: int = 0
    full_name: str | None = None
    class_name: str | None = None
    parents: list[LinkedGuardian] = Field(default_factory=list)


class ParentLinkInfo(ApiModel):
    parent_id: PositiveId
    full_name: str
    email: str
    relationship: str
    linked_at: datetime | None
    requested_at: datetime


class TeacherStudentResponse(StudentPublicResponse):
    parent_link_status: Literal["NONE", "PENDING", "SYNCED"] = "NONE"
    parent_info: ParentLinkInfo | None = None


class ParentLinkActionRequest(ApiModel):
    # Optional for existing callers; the UI supplies this to reject stale actions.
    parent_id: PositiveId | None = None


class ParentLinkActionResponse(ApiModel):
    success: bool
    message: str


class EnrollmentResponse(ApiModel):
    message: str
    student_id: PositiveId
    masked_lrn: str


class ChildPublicResponse(StudentPublicResponse):
    age: float | None = None
    teacher_fname: str | None = None
    teacher_lname: str | None = None
    father_name: str | None = None
    father_age: int | None = None
    father_occ: str | None = None
    father_educ: str | None = None
    mother_name: str | None = None
    mother_age: int | None = None
    mother_occ: str | None = None
    mother_educ: str | None = None
    legal_guardian_name: str | None = None
    legal_guardian_age: int | None = None
    legal_guardian_occ: str | None = None
    legal_guardian_educ: str | None = None
    allow_parent_view_student_info: bool = True
    allow_parent_view_eccd_pre: bool = False
    allow_parent_view_eccd_mid: bool = False
    allow_parent_view_eccd_post: bool = False
    allow_parent_edit_student_info: bool = True
    allow_parent_edit_home_based_eccd: bool = False


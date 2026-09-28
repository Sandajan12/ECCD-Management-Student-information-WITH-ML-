from datetime import date

from backend.models.student import Gender, Handedness
from pydantic import BaseModel, ConfigDict


class StudentBase(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    date_of_birth: date | None = None
    gender: Gender | None = None
    section_id: int | None = None
    section_name: str | None = None
    address: str | None = None
    handedness: Handedness | None = None
    num_of_siblings: int | None = None
    birth_order: str | None = None
    emergency_contact: str | None = None
    is_active: bool | None = True
    school_year: str | None = None


class StudentCreate(StudentBase):
    lrn_number: str


class StudentUpdate(StudentBase):
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

    model_config = ConfigDict(extra="ignore")

    from pydantic import field_validator
    @field_validator("father_age", "mother_age", "legal_guardian_age", "num_of_siblings", mode="before")
    @classmethod
    def coerce_empty_to_none(cls, v):
        if v is None or v == "" or str(v).strip() == "":
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None


class StudentResponse(StudentBase):
    lrn_number: str

    model_config = ConfigDict(from_attributes=True)


class StudentWithAgeResponse(StudentResponse):
    decimal_age: float | None = None


class FamilyAccessCreate(BaseModel):
    student_lrn: str | None = None
    lrn_number: str | None = None
    relationship_type: str | None = "Guardian"

    model_config = ConfigDict(extra="ignore")

    @property
    def target_lrn(self) -> str:
        return self.student_lrn or self.lrn_number or ""


class StudentTransferRequest(BaseModel):
    lrn_numbers: list[str]
    new_section_id: int


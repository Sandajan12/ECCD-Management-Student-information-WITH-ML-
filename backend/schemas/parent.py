from datetime import date
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator
from .common import Lrn, PositiveId


class ParentBase(BaseModel):
    fullname: Optional[str] = None
    educational_attainment: Optional[str] = None
    occupation: Optional[str] = None
    age: Optional[int] = None
    relationship_type: Optional[str] = None


class ParentCreate(ParentBase):
    user_id: Optional[int] = None


class ParentUpdate(ParentBase):
    pass


class ParentResponse(ParentBase):
    parent_id: int
    user_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class ChildProfileResponse(BaseModel):
    lrn_number: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    age: Optional[float] = None
    gender: Optional[str] = None
    section_name: Optional[str] = None
    teacher_fname: Optional[str] = None
    teacher_lname: Optional[str] = None
    address: Optional[str] = None
    handedness: Optional[str] = None
    num_of_siblings: Optional[int] = None
    birth_order: Optional[str] = None
    emergency_contact: Optional[str] = None
    father_name: Optional[str] = None
    father_age: Optional[int] = None
    father_occ: Optional[str] = None
    father_educ: Optional[str] = None
    mother_name: Optional[str] = None
    mother_age: Optional[int] = None
    mother_occ: Optional[str] = None
    mother_educ: Optional[str] = None
    allow_parent_view_student_info: bool = True
    allow_parent_view_eccd_pre: bool = False
    allow_parent_view_eccd_mid: bool = False
    allow_parent_view_eccd_post: bool = False
    allow_parent_edit_student_info: bool = True
    allow_parent_edit_home_based_eccd: bool = False
    allow_parent_view: bool = True
    allow_parent_edit: bool = False
    allow_parent_home_based_edit: bool = False

    model_config = ConfigDict(from_attributes=True, extra="ignore")


class ParentChildUpdateRequest(BaseModel):
    emergency_contact: Optional[str] = Field(default=None, max_length=20)
    address: Optional[str] = Field(default=None, max_length=100)
    handedness: Optional[str] = Field(default=None, pattern="^(Left|Right)$")
    num_of_siblings: Optional[int] = Field(default=None, ge=0)
    birth_order: Optional[str] = Field(default=None, max_length=50)
    father_name: Optional[str] = Field(default=None, max_length=100)
    father_age: Optional[int] = Field(default=None, ge=0)
    father_occ: Optional[str] = Field(default=None, max_length=50)
    father_educ: Optional[str] = Field(default=None, max_length=20)
    mother_name: Optional[str] = Field(default=None, max_length=100)
    mother_age: Optional[int] = Field(default=None, ge=0)
    mother_occ: Optional[str] = Field(default=None, max_length=50)
    mother_educ: Optional[str] = Field(default=None, max_length=20)

    model_config = ConfigDict(extra="ignore")

    @field_validator("num_of_siblings", "father_age", "mother_age", mode="before")
    @classmethod
    def coerce_empty_to_none(cls, v: Any) -> Optional[int]:
        if v is None or v == "" or str(v).strip() == "":
            return None
        return v


class ParentLinkChildRequest(BaseModel):
    lrn_number: Lrn
    relationship_type: Optional[str] = "Guardian"

    model_config = ConfigDict(extra="ignore")


class DomainScoreItem(BaseModel):
    domain_code: str
    domain_name: str
    raw_score: Optional[int] = None
    scaled_score: Optional[int] = None


class PeriodSummary(BaseModel):
    testing_period: str
    is_published: bool = True
    evaluation_date: Optional[date] = None
    decimal_age: Optional[float] = None
    domains: List[DomainScoreItem]
    sum_of_scaled_scores: Optional[int] = None
    standard_score: Optional[int] = None
    interpretation: Optional[str] = None


class ParentEccdSummaryResponse(BaseModel):
    student_id: PositiveId
    student_lrn: str
    student_name: str
    current_phase: Optional[str] = None
    periods: Dict[str, Optional[PeriodSummary]]
    permissions: Optional[Dict[str, bool]] = None

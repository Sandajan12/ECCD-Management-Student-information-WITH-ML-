from datetime import datetime

from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from .common import PositiveId


class SectionBase(BaseModel):
    section_name: str = Field(min_length=1, max_length=50)
    adviser_teacher_id: PositiveId | None = Field(default=None, validation_alias=AliasChoices("adviser_teacher_id", "teacher_id"))


class SectionCreate(SectionBase):
    pass


class SectionUpdate(BaseModel):
    section_name: str | None = None
    adviser_teacher_id: int | None = None


class SectionResponse(SectionBase):
    section_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

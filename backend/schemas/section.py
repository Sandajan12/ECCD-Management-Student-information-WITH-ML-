from datetime import datetime
from typing import Annotated

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, StringConstraints
from .common import PositiveId


class SectionBase(BaseModel):
    section_name: str = Field(min_length=1, max_length=100)
    adviser_teacher_id: PositiveId | None = Field(default=None, validation_alias=AliasChoices("adviser_teacher_id", "teacher_id"))


class SectionCreate(SectionBase):
    pass


class SectionUpdate(BaseModel):
    section_name: str | None = Field(default=None, min_length=1, max_length=100)
    adviser_teacher_id: int | None = None


class SectionRename(BaseModel):
    model_config = ConfigDict(extra="forbid")
    section_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class SectionResponse(SectionBase):
    section_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SectionCreatedResponse(SectionResponse):
    message: str = "Section created successfully."

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SectionBase(BaseModel):
    section_name: str
    adviser_teacher_id: int | None = None


class SectionCreate(SectionBase):
    pass


class SectionUpdate(BaseModel):
    section_name: str | None = None
    adviser_teacher_id: int | None = None


class SectionResponse(SectionBase):
    section_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

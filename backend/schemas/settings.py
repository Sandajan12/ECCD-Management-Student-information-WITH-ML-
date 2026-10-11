from datetime import datetime
from uuid import UUID
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .common import ApiModel, MessageResult, OpeningMonth, PositiveId, SchoolYear
from typing import Optional


class SettingsResponse(BaseModel):
    system_title: str
    primary_color: str
    secondary_color: str
    logo_url: Optional[str] = None
    profile_pic_url: Optional[str] = None
    current_school_year: str
    previous_school_year: Optional[str] = None
    last_rollover_timestamp: Optional[str] = None
    login_background: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SchoolSettingsResponse(SettingsResponse):
    id: int = 1
    school_name: str = Field(max_length=255)
    principal_name: str | None = Field(default=None, max_length=255)
    school_year_start_month: OpeningMonth
    canRevertSchoolYear: bool = False
    daysRemaining: int = Field(default=0, ge=0, le=30)
    previousSchoolYear: str | None = None


class SettingsUpdateResult(ApiModel):
    message: str
    settings: SchoolSettingsResponse


class BackgroundResult(MessageResult):
    url: str


class SchoolSettingsUpdate(ApiModel):
    school_name: str | None = Field(default=None, min_length=1, max_length=255)
    principal_name: str | None = Field(default=None, max_length=255)
    system_title: str | None = Field(default=None, min_length=1, max_length=255)
    primary_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    secondary_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    school_year_start_month: OpeningMonth | None = None


class RolloverRequest(ApiModel):
    school_year_start_month: OpeningMonth | None = None


class RolloverResponse(ApiModel):
    message: str
    next_school_year: SchoolYear
    school_year_start_month: OpeningMonth


class RolloverSnapshot(ApiModel):
    batch: UUID
    previousYear: SchoolYear
    nextYear: SchoolYear
    startMonth: OpeningMonth

    @model_validator(mode="after")
    def validate_years(self) -> "RolloverSnapshot":
        if int(self.nextYear[:4]) != int(self.previousYear[:4]) + 1:
            raise ValueError("Rollover must advance exactly one school year")
        return self


class RolloverRecordChunk(ApiModel):
    batch: UUID
    kind: Literal["students", "messages"]
    ids: list[PositiveId] = Field(max_length=500)


class RolloverUndoResponse(ApiModel):
    success: bool = True
    message: str
    restored_school_year: SchoolYear
    school_year_start_month: OpeningMonth


class RolloverUndoAvailability(ApiModel):
    isUndoAvailable: bool
    undo_available_until: datetime | None = None
    remaining_days: int = Field(ge=0, le=30)


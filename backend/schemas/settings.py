from pydantic import BaseModel
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

    class Config:
        from_attributes = True


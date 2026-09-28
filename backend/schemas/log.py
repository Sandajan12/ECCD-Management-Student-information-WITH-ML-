from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SystemLogBase(BaseModel):
    action_type: str
    details: str | None = None


class SystemLogCreate(SystemLogBase):
    user_id: int | None = None


class SystemLogResponse(SystemLogBase):
    log_id: int
    user_id: int | None = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)

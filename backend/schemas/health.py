from typing import Literal
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    timestamp: int


class ReadinessResponse(BaseModel):
    status: Literal["ready", "unready"]
    database: Literal["connected", "disconnected"]
    timestamp: int
    error: str | None = None

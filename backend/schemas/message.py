from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .common import ApiModel, PositiveId

from backend.models.message import SenderRole


class MessageBase(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    message_body: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def reconcile_body_fields(cls, data: dict):
        if isinstance(data, dict):
            b = data.get("body") or data.get("message_body")
            data["body"] = b
            data["message_body"] = b
        return data


class MessageCreate(BaseModel):
    parent_id: PositiveId
    teacher_id: PositiveId
    sender_role: SenderRole | None = None
    subject: Optional[str] = Field(default=None, max_length=255)
    body: Optional[str] = None
    message_body: Optional[str] = None
    sent_at: Optional[str] = None

    model_config = ConfigDict(extra="ignore")

    @property
    def content(self) -> str:
        return (self.body or self.message_body or "").strip()


class MessageResponse(BaseModel):
    message_id: int
    parent_id: int
    teacher_id: int
    sender_role: SenderRole
    subject: Optional[str] = None
    body: str
    message_body: Optional[str] = None
    is_read: bool
    is_archived: bool
    created_at: datetime
    sent_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def populate_aliases(cls, data):
        if hasattr(data, "body"):
            b = data.body
            t = data.created_at.isoformat() if data.created_at else None
            return {
                "message_id": data.message_id,
                "parent_id": data.parent_id,
                "teacher_id": data.teacher_id,
                "sender_role": data.sender_role,
                "subject": data.subject,
                "body": b,
                "message_body": b,
                "is_read": data.is_read,
                "is_archived": data.is_archived,
                "created_at": data.created_at,
                "sent_at": t,
            }
        elif isinstance(data, dict):
            b = data.get("body") or data.get("message_body") or ""
            data["body"] = b
            data["message_body"] = b
            if "created_at" in data and data["created_at"] and not data.get("sent_at"):
                data["sent_at"] = data["created_at"].isoformat() if hasattr(data["created_at"], "isoformat") else str(data["created_at"])
        return data


class NotifyStudentRequest(ApiModel):
    student_id: PositiveId


class NotifyStudentResponse(ApiModel):
    message: str
    recipients: int = Field(ge=1)


class ConversationRequest(ApiModel):
    teacher_id: PositiveId
    parent_id: PositiveId


class PersistedMessageResponse(MessageResponse):
    message: str = "Message sent!"


class Contact(ApiModel):
    id: PositiveId
    name: str
    latest_message_time: datetime | None = None


class ContactsResponse(ApiModel):
    myId: PositiveId | None
    contacts: list[Contact]


class UnreadResponse(ApiModel):
    unreadCount: int = Field(ge=0)


class SuccessResponse(ApiModel):
    success: bool = True


class SocketMessageRequest(ApiModel):
    room: str = Field(pattern=r"^teacher-[1-9][0-9]*-parent-[1-9][0-9]*$")
    message_id: PositiveId

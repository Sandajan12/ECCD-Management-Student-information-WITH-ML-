import enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from .base import Base


class SenderRole(str, enum.Enum):
    TEACHER = "teacher"
    PARENT = "parent"


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (Index("idx_messages_thread", "parent_id", "teacher_id", "is_archived", "created_at"),)

    message_id = Column(Integer, primary_key=True, autoincrement=True)
    parent_id = Column(
        Integer, ForeignKey("parents.parent_id", ondelete="CASCADE"), nullable=False
    )
    teacher_id = Column(
        Integer, ForeignKey("teachers.teacher_id", ondelete="CASCADE"), nullable=False
    )
    sender_role = Column(Enum(SenderRole), nullable=False)
    subject = Column(String(255), nullable=True)
    body = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    parent = relationship("Parent", back_populates="messages")
    teacher = relationship("Teacher", back_populates="messages")

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import relationship

from .base import Base


class SystemLog(Base):
    __tablename__ = "system_logs"
    __table_args__ = (Index("idx_logs_timestamp", "timestamp"),
                      Index("idx_logs_user", "user_id"),
                      Index("idx_logs_action_id", "action_type", "log_id"))

    log_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True
    )
    action_type = Column(String(50), nullable=False)
    # Legacy rollover snapshots/chunks are JSON documents stored in the audit trail.
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime, server_default=func.now())

    user = relationship("User")

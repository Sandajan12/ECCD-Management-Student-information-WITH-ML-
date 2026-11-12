"""One browser cookie family; JWTs themselves are never persisted."""
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from .base import Base


class RefreshSession(Base):
    __tablename__ = "auth_refresh_sessions"

    id = Column(String(64), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    current_jti = Column(String(64), nullable=False)
    previous_jti = Column(String(64), nullable=True)
    previous_valid_until = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    __table_args__ = (Index("idx_refresh_user_expiry", "user_id", "expires_at"),)

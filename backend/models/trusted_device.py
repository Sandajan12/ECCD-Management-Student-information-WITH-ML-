from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import relationship

from .base import Base


class UserTrustedDevice(Base):
    __tablename__ = "user_trusted_devices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    device_token_hash = Column(String(64), nullable=False)
    user_agent = Column(String(255), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="trusted_devices")
    __table_args__ = (Index("idx_user_device", "user_id", "device_token_hash"),
                      Index("idx_device_token", "device_token_hash"),
                      Index("idx_device_user_expiry", "user_id", "expires_at"))

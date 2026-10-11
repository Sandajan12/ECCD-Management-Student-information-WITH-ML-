import enum

from sqlalchemy import CheckConstraint, Column, Integer, String, DateTime, Enum, ForeignKey, UniqueConstraint
from .base import Base

class OtpPurpose(str, enum.Enum):
    REGISTRATION = "registration"
    LOGIN = "login"
    PASSWORD_CHANGE = "password_change"
    EMAIL_CHANGE = "email_change"


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(100), nullable=False, index=True)
    otp = Column(String(10), default="", nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=True)
    purpose = Column(Enum(OtpPurpose, values_callable=lambda values: [item.value for item in values]), nullable=True)
    challenge_hash = Column(String(64), nullable=True)
    otp_hash = Column(String(64), nullable=True)
    attempts = Column(Integer, default=0, server_default="0", nullable=False)
    __table_args__ = (
        UniqueConstraint("challenge_hash", name="unique_otp_challenge"),
        CheckConstraint("attempts >= 0", name="ck_otp_attempts"),
    )

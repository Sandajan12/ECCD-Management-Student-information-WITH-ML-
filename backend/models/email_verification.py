from sqlalchemy import Column, Integer, String, DateTime
from .base import Base

class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(100), nullable=False, index=True)
    otp = Column(String(10), nullable=False)
    expires_at = Column(DateTime, nullable=False)

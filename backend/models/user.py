import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, String, func
from sqlalchemy.orm import relationship

from .base import Base


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super-admin"
    ADMIN = "admin"
    USER = "user"


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    email = Column(String(100), nullable=True, unique=True, comment="Login Email")
    role = Column(
        Enum(UserRole, values_callable=lambda obj: [e.value for e in obj]),
        nullable=True,
    )
    created_at = Column(DateTime, server_default=func.now())
    is_active = Column(Boolean, default=True)
    otp_code = Column(String(10), nullable=True)
    otp_expires_at = Column(DateTime, nullable=True)

    teacher = relationship(
        "Teacher", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    parent = relationship(
        "Parent", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )

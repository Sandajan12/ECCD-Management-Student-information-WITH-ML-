import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, Index, Integer, String, func
from sqlalchemy.orm import relationship

from .base import Base


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super-admin"
    ADMIN = "admin"
    USER = "user"


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, autoincrement=True)
    password_hash = Column(String(255), nullable=False)
    email = Column(String(100), nullable=True, unique=True, comment="Login Email")
    role = Column(
        Enum(UserRole, values_callable=lambda obj: [e.value for e in obj]),
        nullable=True,
    )
    created_at = Column(DateTime, server_default=func.now())
    is_active = Column(Boolean, default=True)
    # Existing accounts are backfilled False; new teacher provisioning opts in in Phase 2.
    is_first_login = Column(Boolean, default=False, server_default="false", nullable=False)
    is_registration_pending = Column(Boolean, default=False, server_default="false", nullable=False)
    security_version = Column(Integer, default=0, server_default="0", nullable=False)
    otp_code = Column(String(10), nullable=True)
    otp_expires_at = Column(DateTime, nullable=True)
    __table_args__ = (Index("ux_users_email_lower", func.lower(email), unique=True),
                      Index("idx_users_role_active", "role", "is_active"))

    teacher = relationship(
        "Teacher", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    parent = relationship(
        "Parent", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    trusted_devices = relationship("UserTrustedDevice", back_populates="user", cascade="all, delete-orphan")

from sqlalchemy import CheckConstraint, Column, Integer, String, Text

from .base import Base
from backend.constants import DEFAULT_SYSTEM_NAME


class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, default=1)
    system_title = Column(String(255), default="School Management System")
    system_name = Column(String(255), default=DEFAULT_SYSTEM_NAME, server_default=DEFAULT_SYSTEM_NAME, nullable=False)
    principal_name = Column(String(255), nullable=True)
    chairman_name = Column(String(255), nullable=True)
    school_year_start_month = Column(Integer, default=8, server_default="8", nullable=False)
    primary_color = Column(String(10), default="#2D6A4F")
    logo_url = Column(Text, nullable=True)
    current_school_year = Column(String(20), default="2026-2027")
    previous_school_year = Column(String(20), nullable=True)
    last_rollover_timestamp = Column(String(100), nullable=True)
    __table_args__ = (
        CheckConstraint("school_year_start_month BETWEEN 1 AND 12", name="ck_school_year_start_month"),
    )

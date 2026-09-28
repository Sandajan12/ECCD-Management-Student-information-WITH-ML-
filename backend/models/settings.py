from sqlalchemy import Column, Integer, String, Text

from .base import Base


class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, default=1)
    system_title = Column(String(255), default="School Management System")
    primary_color = Column(String(10), default="#2D6A4F")
    secondary_color = Column(String(10), default="#FFFFFF")
    logo_url = Column(Text, nullable=True)
    profile_pic_url = Column(Text, nullable=True)
    current_school_year = Column(String(20), default="2026-2027")
    previous_school_year = Column(String(20), nullable=True)
    last_rollover_timestamp = Column(String(100), nullable=True)
    login_background = Column(Text, nullable=True)

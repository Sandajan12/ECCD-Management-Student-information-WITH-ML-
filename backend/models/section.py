from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func, true, false
from sqlalchemy.orm import relationship

from .base import Base


class Section(Base):
    __tablename__ = "sections"

    section_id = Column(Integer, primary_key=True, autoincrement=True)
    section_name = Column(String(100), nullable=False, unique=True)
    pre_test_parent_editable = Column(Boolean, nullable=False, default=True, server_default=true())
    mid_test_parent_editable = Column(Boolean, nullable=False, default=False, server_default=false())
    post_test_parent_editable = Column(Boolean, nullable=False, default=False, server_default=false())
    adviser_teacher_id = Column(
        Integer, ForeignKey("teachers.teacher_id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(DateTime, server_default=func.now())

    adviser = relationship("Teacher", back_populates="sections")
    teacher_assignments = relationship(
        "SectionTeacher", back_populates="section", cascade="all, delete-orphan"
    )
    students = relationship("Student", back_populates="section")

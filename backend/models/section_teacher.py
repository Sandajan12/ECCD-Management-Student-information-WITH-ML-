import enum
from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship
from .base import Base


class TeacherRole(str, enum.Enum):
    PRIMARY_ADVISER = "Primary Adviser"
    SUBSTITUTE = "Substitute"


class AssignmentStatus(str, enum.Enum):
    ACTIVE = "Active"
    INACTIVE = "Inactive"


class SectionTeacher(Base):
    __tablename__ = "section_teachers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    section_id = Column(
        Integer,
        ForeignKey("sections.section_id", ondelete="CASCADE"),
        nullable=False,
    )
    teacher_id = Column(
        Integer,
        ForeignKey("teachers.teacher_id", ondelete="CASCADE"),
        nullable=False,
    )
    role = Column(String(50), default="Primary Adviser", nullable=False)
    status = Column(String(20), default="Active", nullable=False)
    assigned_date = Column(DateTime, server_default=func.now())

    section = relationship("Section", back_populates="teacher_assignments")
    teacher = relationship("Teacher", back_populates="section_assignments")
    __table_args__ = (
        CheckConstraint("role IN ('Primary Adviser', 'Substitute')", name="ck_section_teacher_role"),
        CheckConstraint("status IN ('Active', 'Inactive')", name="ck_section_teacher_status"),
    )

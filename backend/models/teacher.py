from sqlalchemy import Boolean, Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from .base import Base


class Teacher(Base):
    __tablename__ = "teachers"

    teacher_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        unique=True,
        nullable=True,
    )
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    employee_id = Column(String(50), unique=True, nullable=True)
    class_name = Column(String(100), nullable=True)
    allow_parent_view_student_info = Column(Boolean, default=True)
    allow_parent_view_eccd_pre = Column(Boolean, default=False)
    allow_parent_view_eccd_mid = Column(Boolean, default=False)
    allow_parent_view_eccd_post = Column(Boolean, default=False)
    allow_parent_edit_student_info = Column(Boolean, default=True)
    allow_parent_edit_home_based_eccd = Column(Boolean, default=False)
    allow_eccd_question_management = Column(Boolean, default=False, nullable=False)

    @property
    def allow_parent_view(self) -> bool:
        return bool(self.allow_parent_view_student_info)

    @property
    def allow_parent_edit(self) -> bool:
        return bool(self.allow_parent_edit_student_info)

    @property
    def allow_parent_home_based_edit(self) -> bool:
        return bool(self.allow_parent_edit_home_based_eccd)

    user = relationship("User", back_populates="teacher")
    sections = relationship("Section", back_populates="adviser")
    section_assignments = relationship(
        "SectionTeacher", back_populates="teacher", cascade="all, delete-orphan"
    )
    messages = relationship(
        "Message", back_populates="teacher", cascade="all, delete-orphan"
    )

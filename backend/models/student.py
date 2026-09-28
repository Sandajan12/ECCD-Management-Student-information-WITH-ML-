import enum

from sqlalchemy import Boolean, Column, Date, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from .base import Base


class Gender(str, enum.Enum):
    MALE = "Male"
    FEMALE = "Female"


class Handedness(str, enum.Enum):
    LEFT = "Left"
    RIGHT = "Right"


class Student(Base):
    __tablename__ = "students"

    lrn_number = Column(String(50), primary_key=True, comment="Encoded by Teacher")
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    gender = Column(Enum(Gender), nullable=True)
    section_id = Column(
        Integer,
        ForeignKey(
            "sections.section_id", ondelete="SET NULL", name="fk_student_section"
        ),
        nullable=True,
    )
    section_name = Column(String(50), nullable=True)
    address = Column(String(100), nullable=True)
    handedness = Column(Enum(Handedness), nullable=True)
    num_of_siblings = Column(Integer, nullable=True)
    birth_order = Column(String(50), nullable=True)
    emergency_contact = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    school_year = Column(String(20), nullable=True)

    section = relationship("Section", back_populates="students")
    parents = relationship(
        "FamilyAccess", back_populates="student", cascade="all, delete-orphan"
    )

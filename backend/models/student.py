import enum

from sqlalchemy import Boolean, Column, Date, Enum, ForeignKey, Identity, Index, Integer, String, Text, UniqueConstraint, event
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Mapper
from sqlalchemy.orm import relationship
from sqlalchemy.ext.hybrid import hybrid_property

from .base import Base


class Gender(str, enum.Enum):
    MALE = "Male"
    FEMALE = "Female"


class Handedness(str, enum.Enum):
    LEFT = "Left"
    RIGHT = "Right"


class Student(Base):
    __tablename__ = "students"

    student_id = Column(Integer, Identity(), primary_key=True)
    lrn_encrypted = Column(Text, nullable=False)
    lrn_search_hash = Column(String(64), nullable=False)
    lrn_last4 = Column(String(4), nullable=False)
    first_name = Column(String(100), nullable=True)
    middle_name = Column(String(100), nullable=True)
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
    section_name = Column(String(100), nullable=True)
    address = Column(String(100), nullable=True)
    handedness = Column(Enum(Handedness), nullable=True)
    num_of_siblings = Column(Integer, nullable=True)
    birth_order = Column(String(50), nullable=True)
    emergency_contact = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    school_year = Column(String(20), nullable=True)

    section = relationship("Section", back_populates="students")
    parents = relationship(
        "FamilyAccess", back_populates="student", cascade="all, delete-orphan",
        foreign_keys="FamilyAccess.student_id",
    )
    evaluations = relationship(
        "StudentEccdEvaluation", back_populates="student", cascade="all, delete-orphan",
        foreign_keys="StudentEccdEvaluation.student_id",
    )

    __table_args__ = (
        UniqueConstraint("lrn_search_hash", name="uq_students_lrn_search_hash"),
        Index("idx_students_section_active", "section_id", "is_active"),
        Index("idx_lrn_last4", "lrn_last4"),
    )

    @property
    def masked_lrn(self) -> str:
        from backend.utils.lrn import mask_lrn
        return mask_lrn(self.lrn_last4)

    @hybrid_property
    def lrn_number(self) -> str:
        from backend.utils.lrn import decrypt_lrn
        return decrypt_lrn(self.lrn_encrypted)

    @lrn_number.setter
    def lrn_number(self, value: str) -> None:
        from backend.utils.lrn import encrypt_lrn, hash_lrn, validate_lrn
        value = validate_lrn(value)
        self.lrn_encrypted, self.lrn_search_hash, self.lrn_last4 = encrypt_lrn(value), hash_lrn(value), value[-4:]

    @lrn_number.comparator
    def lrn_number(cls):
        from .student_identity import StudentLookup
        return StudentLookup(cls.lrn_search_hash)


@event.listens_for(Student, "before_insert")
@event.listens_for(Student, "before_update")
def protect_student_lrn(mapper: Mapper[Student], connection: Connection, student: Student) -> None:
    from backend.utils.lrn import decrypt_lrn, encrypt_lrn, hash_lrn, validate_lrn

    value = validate_lrn(student.lrn_number)
    if student.lrn_encrypted is None or decrypt_lrn(student.lrn_encrypted) != value:
        student.lrn_encrypted = encrypt_lrn(value)
    student.lrn_search_hash = hash_lrn(value)
    student.lrn_last4 = value[-4:]

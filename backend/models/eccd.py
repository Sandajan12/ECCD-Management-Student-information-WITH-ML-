import enum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.ext.hybrid import hybrid_property

from .base import Base


class TestingPeriod(str, enum.Enum):
    PRE = "PRE"
    MID = "MID"
    POST = "POST"


class EccdAnswer(str, enum.Enum):
    KAYA = "KAYA"
    DI_KAYA = "DI-KAYA"


class EccdDomain(Base):
    __tablename__ = "eccd_domains"

    domain_id = Column(Integer, primary_key=True, autoincrement=True)
    domain_name = Column(String(100), nullable=False)

    questions = relationship(
        "EccdQuestion", back_populates="domain", cascade="all, delete-orphan"
    )


class EccdQuestion(Base):
    __tablename__ = "eccd_questions"
    __table_args__ = (Index("idx_questions_domain_sequence", "domain_id", "sequence_order", unique=True),)

    question_id = Column(Integer, primary_key=True, autoincrement=True)
    domain_id = Column(
        Integer,
        ForeignKey("eccd_domains.domain_id", ondelete="CASCADE"),
        nullable=False,
    )
    question_text = Column(Text, nullable=False)
    sequence_order = Column(
        Integer, nullable=False, comment="To keep questions in exact Excel order"
    )
    is_home_based = Column(Boolean, default=False)

    domain = relationship("EccdDomain", back_populates="questions")
    evaluations = relationship(
        "StudentEccdEvaluation", back_populates="question", cascade="all, delete-orphan"
    )


class StudentEccdEvaluation(Base):
    __tablename__ = "student_eccd_evaluations"

    evaluation_id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("students.student_id", ondelete="CASCADE"), nullable=False)
    teacher_id = Column(
        Integer, ForeignKey("teachers.teacher_id", ondelete="SET NULL"), nullable=True
    )
    parent_id = Column(
        Integer,
        ForeignKey("parents.parent_id", name="fk_eccd_evaluator_parent", ondelete="SET NULL"),
        nullable=True,
    )
    evaluator_role = Column(String(7), nullable=False, default="teacher", server_default="teacher")
    question_id = Column(
        Integer,
        ForeignKey("eccd_questions.question_id", ondelete="CASCADE"),
        nullable=False,
    )
    testing_period = Column(Enum(TestingPeriod), nullable=False)
    answer = Column(Enum(EccdAnswer), nullable=False)
    evaluation_date = Column(Date, nullable=False)
    teacher_evaluation_date = Column(Date, nullable=True)
    parent_submitted_at = Column(DateTime(timezone=True), nullable=True)
    teacher_marked_at = Column(DateTime(timezone=True), nullable=True)

    # Enforce strict composite uniqueness matching DepEd logic
    __table_args__ = (
        UniqueConstraint(
            "student_id", "question_id", "testing_period", name="unique_student_eval"
        ),
        CheckConstraint("evaluator_role IN ('teacher', 'parent')", name="ck_eccd_evaluator_role"),
        Index("idx_student_period", "student_id", "testing_period"),
        Index("idx_evaluations_teacher", "teacher_id"),
        Index("idx_evaluations_parent", "parent_id"),
        Index("idx_evaluations_question", "question_id"),
    )

    question = relationship("EccdQuestion", back_populates="evaluations")
    student = relationship("Student", back_populates="evaluations", foreign_keys=[student_id])
    parent = relationship("Parent", back_populates="evaluations")

    @hybrid_property
    def student_lrn(self):
        return getattr(self, "_student_lookup", None) or (self.student.lrn_number if self.student else None)

    @student_lrn.setter
    def student_lrn(self, value):
        self._student_lookup = value

    @student_lrn.comparator
    def student_lrn(cls):
        from .student_identity import StudentReferenceLookup
        return StudentReferenceLookup(cls.student_id)

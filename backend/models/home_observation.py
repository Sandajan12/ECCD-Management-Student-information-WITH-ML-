"""Review records stay separate from official assessment answers."""
from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship
from .base import Base


class HomeObservationPhoto(Base):
    __tablename__ = "home_observation_photos"
    photo_id = Column(String(32), primary_key=True)
    student_id = Column(Integer, ForeignKey("students.student_id", ondelete="SET NULL"))
    parent_id = Column(Integer, ForeignKey("parents.parent_id", ondelete="SET NULL"))
    question_id = Column(Integer, ForeignKey("eccd_questions.question_id", ondelete="SET NULL"))
    testing_period = Column(String(4), nullable=False)
    object_key = Column(String(100), unique=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    ready = Column(Boolean, nullable=False, default=False)
    delete_pending = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime(timezone=True))
    delete_attempts = Column(Integer, nullable=False, default=0)


class ParentHomeObservation(Base):
    __tablename__ = "parent_home_observations"
    __table_args__ = (
        UniqueConstraint("student_id", "question_id", "testing_period", name="uq_home_observation_period"),
        CheckConstraint("answer IN ('KAYA', 'DI-KAYA')", name="ck_home_observation_answer"),
        CheckConstraint("status IN ('pending', 'accepted', 'declined')", name="ck_home_observation_status"),
        CheckConstraint("testing_period IN ('PRE', 'MID', 'POST')", name="ck_home_observation_period"),
    )
    observation_id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("students.student_id", ondelete="CASCADE"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("eccd_questions.question_id", ondelete="CASCADE"), nullable=False)
    testing_period = Column(String(4), nullable=False)
    answer = Column(String(7), nullable=False)
    parent_id = Column(Integer, ForeignKey("parents.parent_id", ondelete="SET NULL"))
    submitted_at = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(8), nullable=False, default="pending")
    reviewer_id = Column(Integer, ForeignKey("teachers.teacher_id", ondelete="SET NULL"))
    reviewed_at = Column(DateTime(timezone=True))
    evaluation_id = Column(Integer, ForeignKey("student_eccd_evaluations.evaluation_id", ondelete="SET NULL"), unique=True)
    photo_id = Column(String(32), ForeignKey("home_observation_photos.photo_id", ondelete="SET NULL"), unique=True)
    photo = relationship(HomeObservationPhoto)
    question = relationship("EccdQuestion")

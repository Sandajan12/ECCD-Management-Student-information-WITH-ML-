from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, func
from sqlalchemy.orm import relationship

from .base import Base
from sqlalchemy.ext.hybrid import hybrid_property


class FamilyAccess(Base):
    __tablename__ = "family_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    parent_id = Column(
        Integer, ForeignKey("parents.parent_id", ondelete="CASCADE"), nullable=False
    )
    student_id = Column(Integer, ForeignKey("students.student_id", ondelete="CASCADE"), nullable=False)
    relationship_type = Column(String(50), nullable=True)
    date_linked = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # Existing account links and non-account guardian records remain synced.
    status = Column(String(10), default="SYNCED", server_default="SYNCED", nullable=False)
    requested_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_family_student", "student_id"),
        CheckConstraint("status IN ('PENDING', 'SYNCED')", name="ck_family_link_status"),
    )

    parent = relationship("Parent", back_populates="students")
    student = relationship("Student", back_populates="parents", foreign_keys=[student_id])

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


class Parent(Base):
    __tablename__ = "parents"

    parent_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        unique=True,
        nullable=True,
    )
    fullname = Column(String(100), nullable=True)
    educational_attainment = Column(String(20), nullable=True)
    occupation = Column(String(50), nullable=True)
    age = Column(Integer, nullable=True)
    relationship_type = Column(String(50), nullable=True)

    user = relationship("User", back_populates="parent")
    evaluations = relationship(
        "StudentEccdEvaluation", back_populates="parent", passive_deletes=True
    )
    students = relationship(
        "FamilyAccess", back_populates="parent", cascade="all, delete-orphan"
    )
    messages = relationship(
        "Message", back_populates="parent", cascade="all, delete-orphan"
    )

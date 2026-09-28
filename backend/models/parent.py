from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from .base import Base


class FamilyAccess(Base):
    __tablename__ = "family_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    parent_id = Column(
        Integer, ForeignKey("parents.parent_id", ondelete="CASCADE"), nullable=False
    )
    student_lrn = Column(
        String(50),
        ForeignKey("students.lrn_number", ondelete="CASCADE"),
        nullable=False,
    )
    relationship_type = Column(String(50), nullable=True)

    parent = relationship("Parent", back_populates="students")
    student = relationship("Student", back_populates="parents")


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
    students = relationship(
        "FamilyAccess", back_populates="parent", cascade="all, delete-orphan"
    )
    messages = relationship(
        "Message", back_populates="parent", cascade="all, delete-orphan"
    )

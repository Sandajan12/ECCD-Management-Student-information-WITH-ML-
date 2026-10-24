from fastapi import HTTPException
from sqlalchemy import and_
from sqlalchemy.orm import Session, aliased
from backend.models import FamilyAccess, Message, Parent, SectionTeacher, Student, Teacher, User


def conversation_relationship(db: Session, teacher_id, parent_id):
    """Live relationship predicate for conversations and message projections.

    EXISTS keeps one message per row when several siblings share a parent.
    IDs may be literal values or correlated Message columns.
    """
    teacher_user, parent_user = aliased(User), aliased(User)
    linked = db.query(Student.student_id).join(FamilyAccess, Student.student_id == FamilyAccess.student_id).join(
        SectionTeacher, SectionTeacher.section_id == Student.section_id
    ).filter(
        FamilyAccess.status == "SYNCED", FamilyAccess.parent_id == parent_id,
        SectionTeacher.teacher_id == teacher_id, SectionTeacher.status == "Active",
        SectionTeacher.role == "Primary Adviser", Student.is_active.is_(True),
    ).correlate(Message).exists()
    active_teacher = db.query(Teacher.teacher_id).join(teacher_user, Teacher.user_id == teacher_user.user_id).filter(
        Teacher.teacher_id == teacher_id, teacher_user.is_active.is_(True), teacher_user.role == "admin",
    ).correlate(Message).exists()
    active_parent = db.query(Parent.parent_id).join(parent_user, Parent.user_id == parent_user.user_id).filter(
        Parent.parent_id == parent_id, parent_user.is_active.is_(True), parent_user.role == "user",
    ).correlate(Message).exists()
    return and_(linked, active_teacher, active_parent)


def authorize_conversation(db: Session, user: User, teacher_id: int, parent_id: int, read_only: bool = False) -> tuple[Teacher, Parent]:
    teacher, parent = db.get(Teacher, teacher_id), db.get(Parent, parent_id)
    if teacher is None or parent is None or teacher.user is None or parent.user is None or not teacher.user.is_active or not parent.user.is_active or teacher.user.role.value != "admin" or parent.user.role.value != "user":
        raise HTTPException(403, "No authorized messaging relationship.")
    linked = db.query(conversation_relationship(db, teacher_id, parent_id)).scalar()
    owner = (user.role.value == "admin" and teacher.user_id == user.user_id) or (user.role.value == "user" and parent.user_id == user.user_id) or (read_only and user.role.value == "super-admin")
    if not linked or not owner:
        raise HTTPException(403, "No authorized messaging relationship.")
    return teacher, parent

from fastapi import HTTPException
from sqlalchemy.orm import Session
from backend.models import FamilyAccess, Parent, Student, Teacher, User
from backend.utils.access import teacher_sections


def authorize_conversation(db: Session, user: User, teacher_id: int, parent_id: int, read_only: bool = False) -> tuple[Teacher, Parent]:
    teacher, parent = db.get(Teacher, teacher_id), db.get(Parent, parent_id)
    if teacher is None or parent is None or teacher.user is None or parent.user is None or not teacher.user.is_active or not parent.user.is_active or teacher.user.role.value != "admin" or parent.user.role.value != "user":
        raise HTTPException(403, "No authorized messaging relationship.")
    linked = db.query(Student).join(FamilyAccess, Student.student_id == FamilyAccess.student_id).filter(FamilyAccess.parent_id == parent_id, Student.section_id.in_(teacher_sections(db, teacher)), Student.is_active.is_(True)).first()
    owner = (user.role.value == "admin" and teacher.user_id == user.user_id) or (user.role.value == "user" and parent.user_id == user.user_id) or (read_only and user.role.value == "super-admin")
    if linked is None or not owner:
        raise HTTPException(403, "No authorized messaging relationship.")
    return teacher, parent

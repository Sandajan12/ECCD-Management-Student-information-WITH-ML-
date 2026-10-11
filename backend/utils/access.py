"""Normalized section ownership and Primary Adviser permission inheritance."""
import re
from datetime import date
from fastapi import HTTPException
from sqlalchemy.orm import Session
from backend.models import FamilyAccess, Parent, Section, SectionTeacher, Student, Teacher, User
from backend.schemas.common import ParentPermissions
from backend.utils.eccd_scorer import calculate_decimal_age
from backend.utils.lrn import hash_lrn


def teacher_sections(db: Session, teacher: Teacher) -> list[int]:
    return [row[0] for row in db.query(SectionTeacher.section_id).filter_by(teacher_id=teacher.teacher_id, status="Active").distinct()]


def current_teacher(db: Session, user: User) -> Teacher:
    teacher = db.query(Teacher).filter_by(user_id=user.user_id).first()
    if teacher is None:
        raise HTTPException(403, "Teacher profile not found.")
    return teacher


def resolve_student(db: Session, identifier: str | int) -> Student:
    value = str(identifier)
    if re.fullmatch(r"[0-9]{12}", value):
        student = db.query(Student).filter_by(lrn_search_hash=hash_lrn(value)).first()
    elif re.fullmatch(r"[0-9]{1,10}", value) and 0 < int(value) <= 2147483647:
        student = db.get(Student, int(value))
    else:
        student = None
    if student is None:
        raise HTTPException(404, "Student not found.")
    return student


def authorize_student(db: Session, user: User, student: Student, parent_edit: bool = False) -> None:
    if user.role.value == "super-admin":
        return
    if user.role.value == "admin":
        if student.section_id not in teacher_sections(db, current_teacher(db, user)):
            raise HTTPException(403, "Student is not assigned to your section.")
        return
    parent = db.query(Parent).filter_by(user_id=user.user_id).first()
    if parent is None or not db.query(FamilyAccess).filter_by(parent_id=parent.parent_id, student_id=student.student_id).first():
        raise HTTPException(403, "This child is not linked to your account.")
    if parent_edit and not permissions_for_student(db, student).allow_parent_edit_student_info:
        raise HTTPException(403, "The Class Adviser has locked editing for student records.")


def get_active_adviser_for_student(student: Student, db: Session) -> Teacher | None:
    return db.query(Teacher).join(SectionTeacher).join(User, Teacher.user_id == User.user_id).filter(
        SectionTeacher.section_id == student.section_id, SectionTeacher.status == "Active", SectionTeacher.role == "Primary Adviser", User.is_active.is_(True)
    ).order_by(SectionTeacher.id.desc()).first()


def permissions_for_student(db: Session, student: Student) -> ParentPermissions:
    teacher = get_active_adviser_for_student(student, db)
    if teacher is None:
        return ParentPermissions(allow_parent_view_student_info=False, allow_parent_edit_student_info=False)
    return ParentPermissions(**{key: bool(getattr(teacher, key)) for key in ParentPermissions.model_fields})


def student_age(db: Session, student: Student) -> float | None:
    from backend.models import SystemSettings
    setting = db.get(SystemSettings, 1)
    year = student.school_year or (setting.current_school_year if setting else None)
    baseline = date(int(year[:4]), setting.school_year_start_month if setting else 8, 1) if year and re.fullmatch(r"[0-9]{4}-[0-9]{4}", year) else date.today()
    return calculate_decimal_age(student.date_of_birth, baseline) if student.date_of_birth else None

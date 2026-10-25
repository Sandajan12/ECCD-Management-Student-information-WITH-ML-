import math
from sqlalchemy.orm import Session
from backend.models import FamilyAccess, Parent, Student, User
from backend.schemas.student import StudentRecordResponse
from backend.utils.access import authorize_student, get_active_adviser_for_student, permissions_for_student, student_age
from backend.utils.account_identity import account_display_name


def public_student(db: Session, student: Student) -> dict:
    result = StudentRecordResponse.model_validate(student).model_dump()
    result.update(lrn_number=student.masked_lrn, lrn=student.masked_lrn, decimal_age=student_age(db, student), section_name=student.section.section_name if student.section else student.section_name)
    fields = (student.lrn_last4, student.first_name, student.last_name, student.date_of_birth, student.gender, student.section_id, student.address, student.handedness, student.num_of_siblings, student.birth_order, student.emergency_contact)
    result["profile_completeness"] = math.floor(sum(value is not None and value != "" for value in fields) * 100 / 11 + 0.5)
    result["parent_names"] = ", ".join(account_display_name(link.parent.user) for link in student.parents if link.status == "SYNCED" and link.parent and link.parent.user_id) or None
    middle = f" {student.middle_name[:1]}." if student.middle_name else ""
    result["full_name"] = f"{student.last_name or ''}, {student.first_name or ''}{middle}".strip()
    result["class_name"] = result["section_name"]
    result["parents"] = [{"fullname": link.parent.fullname, "relationship": link.relationship_type, "age": link.parent.age, "occupation": link.parent.occupation, "educational_attainment": link.parent.educational_attainment} for link in student.parents if link.status == "SYNCED" and link.parent and link.parent.fullname]
    return result


def child_profile(db: Session, student: Student) -> dict:
    permissions = permissions_for_student(db, student)
    teacher = get_active_adviser_for_student(student, db)
    result = public_student(db, student)
    result.update(permissions.model_dump(), age=result["decimal_age"], teacher_fname=teacher.first_name if teacher else None, teacher_lname=teacher.last_name if teacher else None)
    if not permissions.allow_parent_view_student_info:
        for name in ("first_name", "middle_name", "last_name", "date_of_birth", "gender", "address", "handedness", "num_of_siblings", "birth_order", "emergency_contact", "decimal_age", "age", "parent_names"):
            result[name] = None
        result["profile_completeness"] = 0
        result["full_name"], result["parents"] = None, []
        return result
    for relationship, prefix in (("Father", "father"), ("Mother", "mother"), ("Guardian", "legal_guardian")):
        parent = db.query(Parent).join(FamilyAccess).filter(FamilyAccess.status == "SYNCED", FamilyAccess.student_id == student.student_id, FamilyAccess.relationship_type == relationship).first()
        if parent:
            result.update({f"{prefix}_name": parent.fullname, f"{prefix}_age": parent.age, f"{prefix}_occ": parent.occupation, f"{prefix}_educ": parent.educational_attainment})
    return result


def parent_student_name(db: Session, student: Student) -> str:
    # Parent ML schemas require a string, as does the parent ECCD summary.
    if not permissions_for_student(db, student).allow_parent_view_student_info:
        return ""
    return " ".join(part for part in (student.first_name, student.middle_name, student.last_name) if part) or f"Student {student.student_id}"


def upsert_guardian(db: Session, student: Student, relationship: str, name: str | None, age: int | None, occupation: str | None, education: str | None, *, user: User) -> None:
    if not name or not name.strip():
        return
    parent = db.query(Parent).join(FamilyAccess).filter(FamilyAccess.status == "SYNCED", FamilyAccess.student_id == student.student_id, FamilyAccess.relationship_type == relationship).with_for_update(of=Parent).first()
    if parent is not None:
        if (parent.fullname, parent.age, parent.occupation, parent.educational_attainment) == (name.strip(), age, occupation, education):
            return
        # Pending and archived siblings also share these fields. A target's
        # permission cannot grant writes to another child's guardian profile.
        linked_children = db.query(Student).join(FamilyAccess).filter(FamilyAccess.parent_id == parent.parent_id).distinct().all()
        for child in linked_children:
            authorize_student(db, user, child, parent_edit=user.role.value == "user")
    if parent is None:
        parent = Parent(relationship_type=relationship)
        db.add(parent)
        db.flush()
        db.add(FamilyAccess(student_id=student.student_id, parent_id=parent.parent_id, relationship_type=relationship))
    parent.fullname, parent.age = name.strip(), age
    parent.occupation, parent.educational_attainment = occupation, education

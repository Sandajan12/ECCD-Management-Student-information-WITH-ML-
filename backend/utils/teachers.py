from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from backend.models import Section, SectionTeacher, SystemLog, Teacher, User
from backend.models.user import UserRole
from backend.schemas.teacher import TeacherProvisionRequest
from backend.utils.security import get_password_hash


def assign_teacher(db: Session, user: User, section_id: int, teacher_id: int | None, role: str = "Primary Adviser") -> Section:
    section = db.query(Section).filter_by(section_id=section_id).with_for_update().first()
    if section is None:
        raise HTTPException(404, "Section not found.")
    teacher = db.get(Teacher, teacher_id) if teacher_id else None
    if teacher_id and (teacher is None or teacher.user is None or teacher.user.role != UserRole.ADMIN):
        raise HTTPException(404, "Incoming teacher not found.")
    if role not in ("Primary Adviser", "Substitute"):
        raise HTTPException(422, "Unsupported section assignment role.")
    if role == "Substitute" and teacher is None:
        raise HTTPException(422, "Select a teacher for a substitute assignment.")
    if role == "Primary Adviser":
        for previous in db.query(SectionTeacher).filter_by(section_id=section_id, role="Primary Adviser", status="Active").with_for_update().all():
            if previous.teacher_id != teacher_id:
                previous.status = "Inactive"
                db.flush()
                other = db.query(SectionTeacher).filter_by(teacher_id=previous.teacher_id, status="Active").first()
                if other is None:
                    previous.teacher.class_name = None
                    previous.teacher.user.is_active = False
        section.adviser_teacher_id = teacher_id
    if teacher:
        teacher.user.is_active = True
        if role == "Primary Adviser":
            teacher.class_name = section.section_name
            # Promotion replaces this teacher's substitute role in this section.
            db.query(SectionTeacher).filter_by(section_id=section_id, teacher_id=teacher_id, role="Substitute", status="Active").update({"status":"Inactive"})
        elif db.query(SectionTeacher).filter_by(section_id=section_id, teacher_id=teacher_id, role="Primary Adviser", status="Active").first():
            raise HTTPException(409, "This teacher is already the section's Primary Adviser.")
        assignment = db.query(SectionTeacher).filter_by(section_id=section_id, teacher_id=teacher_id, role=role).first()
        if assignment:
            assignment.status = "Active"
        else:
            db.add(SectionTeacher(section_id=section_id, teacher_id=teacher_id, role=role, status="Active"))
    db.add(SystemLog(user_id=user.user_id, action_type="SECTION_HANDOVER_REASSIGNMENT", details=f"Assigned {role} {teacher_id} to section {section_id}; preserved evaluations."))
    return section


def provision_teacher(db: Session, user: User, payload: TeacherProvisionRequest) -> dict:
    if not payload.first_name.strip():
        raise HTTPException(400, "A teacher name is required.")
    section_id = payload.section_id
    if section_id is not None and db.get(Section, section_id) is None:
        raise HTTPException(404, "Section not found.")
    if not section_id and payload.class_name and payload.class_name.strip():
        section = db.query(Section).filter_by(section_name=payload.class_name.strip()).first()
        if section is None:
            section = Section(section_name=payload.class_name.strip())
            db.add(section)
            db.flush()
        section_id = section.section_id
    account = User(username=payload.username, email=payload.email, password_hash=get_password_hash(payload.password), role=UserRole.ADMIN, is_active=True, is_first_login=True, is_registration_pending=False)
    db.add(account)
    try:
        db.flush()
        teacher = Teacher(user_id=account.user_id, first_name=payload.first_name.strip(), last_name=payload.last_name.strip(), employee_id=payload.employee_id, allow_eccd_question_management=False)
        db.add(teacher)
        db.flush()
        if section_id:
            assign_teacher(db, user, section_id, teacher.teacher_id)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Username, email or employee ID is already in use.") from None
    return {"success": True, "message": "Teacher account successfully provisioned.", "user_id": account.user_id, "teacher_id": teacher.teacher_id}

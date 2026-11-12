from backend.schemas.student import StudentIdTransferRequest
from backend.schemas.auth import LoginResponse
from backend.schemas.common import MessageResult
from backend.schemas.operations import ChairmanSectionItem, TeacherListItem
from backend.schemas.section import SectionCreate, SectionCreatedResponse
from backend.schemas.teacher import TeacherPermissionResponse
from backend.schemas.teacher import AssignmentResponse, TransferResponse
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from backend.config.database import get_db
from backend.config.settings import settings
from backend.models.user import User
from backend.models.email_verification import EmailVerification
from backend.schemas.account import VerifyPasswordRequest, AccountUpdateRequest
from backend.utils.security import verify_password, get_password_hash
from backend.utils.deps import verify_role

router = APIRouter(prefix="/api/chairman", tags=["Chairman"])


@router.get("/export-eccd")
def export_all_sections(section: str = Query("All"), schoolYear: str = Query("All"), db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.excel import summary_response
    return summary_response(db, current_user, section, schoolYear)


@router.get("/sections/{section_id}/export-summary")
def export_section(section_id: int, schoolYear: str = Query("All"), db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.excel import summary_response
    return summary_response(db, current_user, section_id, schoolYear)


@router.post("/sections", status_code=201, response_model=SectionCreatedResponse)
def create_section_endpoint(payload: SectionCreate, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.routes.sections import create_section
    section = create_section(payload, db, current_user)
    return {**SectionCreatedResponse.model_validate(section).model_dump(), "message": "Section created successfully."}


@router.delete("/sections/{section_id}", response_model=MessageResult)
def delete_section_endpoint(section_id: int, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.routes.sections import delete_section
    return delete_section(section_id, db, current_user)


@router.post("/verify-password", response_model=MessageResult)
def verify_current_password(
    request: VerifyPasswordRequest,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin"])),
):
    user = db.query(User).filter(User.user_id == current_user.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if not verify_password(request.currentPassword, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect current password.")

    return {"message": "Password verified."}


@router.put("/account", response_model=LoginResponse)
def update_account(request: AccountUpdateRequest, http_request: Request, response: Response, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.account_changes import update_chairman
    from backend.utils.authentication import clear_device_cookies
    try:
        result = update_chairman(db, current_user, request)
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Email is already registered.") from None
    clear_device_cookies(response)
    from backend.utils.authentication import deliver_session
    return deliver_session(result, http_request, response)


from backend.models.teacher import Teacher
from backend.models.section import Section
from backend.models.section_teacher import SectionTeacher
from backend.models.student import Student
from backend.schemas.teacher import TeacherPermissionUpdate, AssignTeacherSectionRequest
from backend.schemas.student import StudentTransferRequest

# Retain the legacy dashboard URLs while sharing the current PostgreSQL logic.
from backend.routes.analytics import get_dashboard_filters, get_dashboard_pie_data, get_dashboard_stats
from backend.schemas.analytics import DashboardFilters, PieChartSlice
from backend.schemas.operations import AnalyticsStats
for path, endpoint, model in (("/dashboard-filters", get_dashboard_filters, DashboardFilters),
                              ("/dashboard-pie", get_dashboard_pie_data, list[PieChartSlice]),
                              ("/dashboard-stats", get_dashboard_stats, AnalyticsStats)):
    router.add_api_route(path, endpoint, methods=["GET"], response_model=model,
                         response_model_exclude_none=True, dependencies=[Depends(verify_role(["super-admin"]))])


@router.put("/teachers/{teacher_id}/permissions", response_model=TeacherPermissionResponse)
def update_teacher_permissions(
    teacher_id: int,
    payload: TeacherPermissionUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "chairman"])),
):
    teacher = db.query(Teacher).filter(Teacher.teacher_id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found.")

    teacher.allow_eccd_question_management = payload.allow_eccd_question_management

    status_str = "granted" if payload.allow_eccd_question_management else "revoked"
    from backend.utils.audit import record_audit, teacher_name
    record_audit(db, current_user, "UPDATE_TEACHER_PERMISSION",
                 f'{status_str.capitalize()} ECCD Question Management permission for Teacher "{teacher_name(teacher)}".',
                 teacherId=teacher_id, teacherName=teacher_name(teacher))
    db.commit()

    return {
        "message": f"ECCD Question Management permission successfully {status_str}.",
        "teacher_id": teacher_id,
        "allow_eccd_question_management": teacher.allow_eccd_question_management,
    }


@router.put("/students/transfer", response_model=TransferResponse)
def transfer_students(payload: StudentIdTransferRequest | StudentTransferRequest, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.lrn import hash_lrn
    section = db.get(Section, payload.new_section_id)
    if section is None:
        raise HTTPException(404, "Destination section does not exist.")
    identifiers = payload.student_ids if isinstance(payload, StudentIdTransferRequest) else payload.lrn_numbers
    if isinstance(payload, StudentIdTransferRequest):
        rows = db.query(Student).filter(Student.student_id.in_(identifiers)).all()
        by_identifier = {student.student_id: student for student in rows}
        keys = identifiers
    else:
        keys = [hash_lrn(identifier) for identifier in identifiers]
        rows = db.query(Student).filter(Student.lrn_search_hash.in_(keys)).all()
        by_identifier = {student.lrn_search_hash: student for student in rows}
    if any(key not in by_identifier for key in keys):
        raise HTTPException(404, "Student not found.")
    students = [by_identifier[key] for key in keys]
    for student in students:
        student.section_id, student.section_name = section.section_id, section.section_name
    from backend.utils.audit import person_name, record_audit
    names = ", ".join(f'"{person_name(student)}"' for student in students)
    record_audit(db, current_user, "TRANSFER_STUDENTS",
                 f'Transferred {len(students)} students ({names}) to Section "{section.section_name}"; assessments preserved.',
                 sectionId=section.section_id, sectionName=section.section_name)
    db.commit()
    return {"message": f"Successfully transferred {len(students)} student(s) to section {section.section_name}.", "transferred_count": len(students)}


@router.post("/sections/{section_id}/assign-teacher", response_model=AssignmentResponse)
@router.put("/sections/{section_id}/assign", response_model=AssignmentResponse)
def assign_teacher_to_section(section_id: int, payload: AssignTeacherSectionRequest, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.teachers import assign_teacher
    try:
        assign_teacher(db, current_user, section_id, payload.teacher_id)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"message": "Teacher successfully assigned to section.", "section_id": section_id}


@router.get("/sections", response_model=list[ChairmanSectionItem])
def get_chairman_sections(
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "chairman"])),
):
    sections = db.query(Section).order_by(Section.section_name.asc()).all()
    advisers = {}
    for assignment, teacher in db.query(SectionTeacher, Teacher).join(Teacher, SectionTeacher.teacher_id == Teacher.teacher_id).join(User, Teacher.user_id == User.user_id).filter(
        SectionTeacher.status == "Active", SectionTeacher.role == "Primary Adviser", User.is_active.is_(True),
    ).order_by(SectionTeacher.id.desc()).all():
        advisers.setdefault(assignment.section_id, (assignment, teacher))
    results = []
    for sec in sections:
        teacher_info = None
        if sec.section_id in advisers:
            active_assignment, t = advisers[sec.section_id]
            teacher_info = {
                    "teacher_id": t.teacher_id,
                    "first_name": t.first_name,
                    "last_name": t.last_name,
                    "role": active_assignment.role,
                    "status": active_assignment.status,
                }
        results.append(
            {
                "section_id": sec.section_id,
                "section_name": sec.section_name,
                "adviser_teacher_id": (
                    teacher_info["teacher_id"] if teacher_info else None
                ),
                "first_name": teacher_info["first_name"] if teacher_info else None,
                "last_name": teacher_info["last_name"] if teacher_info else None,
                "role": teacher_info["role"] if teacher_info else None,
                "status": teacher_info["status"] if teacher_info else None,
                "is_active": True if teacher_info else None,
            }
        )
    return results


@router.get("/teachers", response_model=list[TeacherListItem])
def get_chairman_teachers(
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "chairman"])),
):
    from backend.routes.teachers import get_teachers
    return get_teachers(True, db, current_user)



from backend.schemas.teacher import TeacherProvisionRequest, TeacherProvisionResponse
@router.post("/teachers", response_model=TeacherProvisionResponse, status_code=201)
def provision_teacher_endpoint(payload: TeacherProvisionRequest, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.teachers import provision_teacher
    return provision_teacher(db, current_user, payload)

from backend.schemas.student import StudentIdTransferRequest
from backend.schemas.auth import LoginResponse
from backend.schemas.common import MessageResult
from backend.schemas.operations import ChairmanSectionItem, TeacherListItem
from backend.schemas.section import SectionCreate, SectionCreatedResponse
from backend.schemas.teacher import TeacherPermissionResponse
from backend.schemas.teacher import AssignmentResponse, TransferResponse
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

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
def update_account(request: AccountUpdateRequest, response: Response, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.account_changes import update_chairman
    from backend.utils.authentication import clear_device_cookies
    result = update_chairman(db, current_user, request)
    clear_device_cookies(response)
    return result


from backend.models.teacher import Teacher
from backend.models.section import Section
from backend.models.section_teacher import SectionTeacher
from backend.models.student import Student
from backend.models.log import SystemLog
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
    action_log = SystemLog(
        user_id=current_user.user_id,
        action_type="UPDATE_TEACHER_PERMISSION",
        details=f"{status_str.upper()} ECCD Question Management permission for Teacher {teacher.first_name} {teacher.last_name} (ID: {teacher_id})",
    )
    db.add(action_log)
    db.commit()

    return {
        "message": f"ECCD Question Management permission successfully {status_str}.",
        "teacher_id": teacher_id,
        "allow_eccd_question_management": teacher.allow_eccd_question_management,
    }


@router.put("/students/transfer", response_model=TransferResponse)
def transfer_students(payload: StudentIdTransferRequest | StudentTransferRequest, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.access import resolve_student
    section = db.get(Section, payload.new_section_id)
    if section is None:
        raise HTTPException(404, "Destination section does not exist.")
    identifiers = payload.student_ids if isinstance(payload, StudentIdTransferRequest) else payload.lrn_numbers
    students = [resolve_student(db, identifier) for identifier in identifiers]
    for student in students:
        student.section_id, student.section_name = section.section_id, section.section_name
    db.add(SystemLog(user_id=current_user.user_id, action_type="TRANSFER_STUDENTS", details=f"Transferred {len(students)} students to section {section.section_id}; assessments preserved."))
    db.commit()
    return {"message": f"Successfully transferred {len(students)} student(s) to section {section.section_name}.", "transferred_count": len(students)}


@router.post("/sections/{section_id}/assign-teacher", response_model=AssignmentResponse)
@router.put("/sections/{section_id}/assign", response_model=AssignmentResponse)
def assign_teacher_to_section(section_id: int, payload: AssignTeacherSectionRequest, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.teachers import assign_teacher
    role = payload.role.value if payload.role else "Primary Adviser"
    assign_teacher(db, current_user, section_id, payload.teacher_id, role)
    db.commit()
    return {"message": "Teacher successfully assigned to section.", "section_id": section_id}


@router.get("/sections", response_model=list[ChairmanSectionItem])
def get_chairman_sections(
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "chairman"])),
):
    sections = db.query(Section).order_by(Section.section_name.asc()).all()
    results = []
    for sec in sections:
        active_assignment = (
            db.query(SectionTeacher)
            .join(Teacher, SectionTeacher.teacher_id == Teacher.teacher_id)
            .join(User, Teacher.user_id == User.user_id)
            .filter(
                SectionTeacher.section_id == sec.section_id,
                SectionTeacher.status == "Active",
                SectionTeacher.role == "Primary Adviser",
                User.is_active.is_(True),
            )
            .order_by(SectionTeacher.id.desc())
            .first()
        )
        teacher_info = None
        if active_assignment:
            t = (
                db.query(Teacher)
                .filter(Teacher.teacher_id == active_assignment.teacher_id)
                .first()
            )
            if t:
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
    teachers = (
        db.query(Teacher)
        .join(User, Teacher.user_id == User.user_id)
        .filter(User.is_active == True)
        .all()
    )
    results = []
    for t in teachers:
        active_assignment = (
            db.query(SectionTeacher, Section)
            .join(Section, SectionTeacher.section_id == Section.section_id)
            .filter(
                SectionTeacher.teacher_id == t.teacher_id,
                SectionTeacher.status == "Active",
            )
            .order_by((SectionTeacher.role == "Primary Adviser").desc())
            .first()
        )
        sec_name = active_assignment[1].section_name if active_assignment else None
        sec_id = active_assignment[1].section_id if active_assignment else None
        sec_role = active_assignment[0].role if active_assignment else None
        results.append(
            {
                "teacher_id": t.teacher_id,
                "user_id": t.user_id,
                "username": t.user.username if t.user else None,
                "first_name": t.first_name,
                "last_name": t.last_name,
                "employee_id": t.employee_id,
                "email": t.user.email if t.user else None,
                "allow_eccd_question_management": bool(
                    t.allow_eccd_question_management
                ),
                "class_name": sec_name,
                "section_name": sec_name,
                "section_id": sec_id,
                "role": sec_role,
                "is_active": t.user.is_active if t.user else True,
            }
        )
    return results



from backend.schemas.teacher import TeacherProvisionRequest, TeacherProvisionResponse
@router.post("/teachers", response_model=TeacherProvisionResponse, status_code=201)
def provision_teacher_endpoint(payload: TeacherProvisionRequest, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.teachers import provision_teacher
    return provision_teacher(db, current_user, payload)

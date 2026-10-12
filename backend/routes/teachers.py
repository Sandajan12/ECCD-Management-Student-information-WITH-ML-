from backend.schemas.account import PasswordChangeRequest, PasswordChangeVerify, ChallengeResult
from backend.schemas.auth import LoginResponse
from backend.schemas.common import MessageResult
from backend.schemas.teacher import ParentPermissionUpdate, TeacherAccessResponse, TeacherProvisionRequest, TeacherProvisionResponse

from backend.config.database import get_db
from backend.config.settings import settings
from backend.models.section import Section
from backend.models.section_teacher import SectionTeacher
from backend.models.teacher import Teacher
from backend.models.user import User, UserRole
from backend.schemas.teacher import TeacherUpdate
from backend.utils.deps import verify_role
from backend.utils.security import verify_password
from backend.utils.email import send_otp_email
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from backend.schemas.operations import ImportResult, TeacherListItem
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError


router = APIRouter(prefix="/api/teachers", tags=["Teachers"])

from backend.routes.analytics import get_dashboard_filters, get_dashboard_pie_data, get_dashboard_stats
from backend.schemas.analytics import DashboardFilters, PieChartSlice
from backend.schemas.operations import AnalyticsStats
for path, endpoint, model in (("/dashboard-filters", get_dashboard_filters, DashboardFilters),
                              ("/dashboard-pie", get_dashboard_pie_data, list[PieChartSlice]),
                              ("/dashboard-stats", get_dashboard_stats, AnalyticsStats)):
    router.add_api_route(path, endpoint, methods=["GET"], response_model=model,
                         response_model_exclude_none=True, dependencies=[Depends(verify_role(["admin"]))])


@router.post("/import-students", response_model=ImportResult)
async def import_student_records(file: UploadFile = File(...), section_id: int | None = Form(None), db: Session = Depends(get_db), current_user=Depends(verify_role(["admin"]))):
    from backend.utils.excel import import_students
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(400, "Upload an .xlsx workbook containing InfoSheet and ECCD domain sheets.")
    return import_students(db, current_user, await file.read(), section_id)


@router.get("/active", response_model=list[TeacherListItem])
@router.get("/", response_model=list[TeacherListItem])
def get_teachers(
    active: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["super-admin", "chairman", "admin", "teacher"])),
):
    query = (
        db.query(Teacher, User)
        .join(User, Teacher.user_id == User.user_id)
        .filter(User.is_active == active)
    )
    results = []
    for teacher, user in query.all():
        active_assignment = (
            db.query(SectionTeacher, Section)
            .join(Section, SectionTeacher.section_id == Section.section_id)
            .filter(
                SectionTeacher.teacher_id == teacher.teacher_id,
                SectionTeacher.status == "Active",
            )
            .order_by((SectionTeacher.role == "Primary Adviser").desc())
            .first()
        )
        sec_name = active_assignment[1].section_name if active_assignment else teacher.class_name
        sec_id = active_assignment[1].section_id if active_assignment else None
        sec_role = active_assignment[0].role if active_assignment else None

        results.append(
            {
                "teacher_id": teacher.teacher_id,
                "user_id": user.user_id,
                "username": user.username,
                "email": user.email,
                "first_name": teacher.first_name,
                "last_name": teacher.last_name,
                "employee_id": teacher.employee_id,
                "class_name": sec_name,
                "section_name": sec_name,
                "section_id": sec_id,
                "role": sec_role,
                "allow_eccd_question_management": bool(teacher.allow_eccd_question_management),
                "is_active": user.is_active,
            }
        )
    return results


@router.get("/archived", response_model=list[TeacherListItem])
def get_archived_teachers(db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    return get_teachers(False, db, current_user)


@router.post("/", status_code=201, response_model=TeacherProvisionResponse)
@router.post("/create", status_code=201, response_model=TeacherProvisionResponse)
def create_teacher(payload: TeacherProvisionRequest, db: Session = Depends(get_db), current_user: User = Depends(verify_role(["super-admin"]))):
    from backend.utils.teachers import provision_teacher
    return provision_teacher(db, current_user, payload)


@router.post("/change-password-request", response_model=ChallengeResult, response_model_exclude_none=True)
async def request_password_change(payload: PasswordChangeRequest, db: Session = Depends(get_db), current_user: User = Depends(verify_role(["admin"]))):
    from backend.utils.authentication import issue_challenge
    from backend.models.email_verification import OtpPurpose
    if not verify_password(payload.oldPassword, current_user.password_hash):
        raise HTTPException(401, "Incorrect current password.")
    if not settings.otp_enabled:
        return {"message": "Email verification is disabled for local development.", "email": current_user.email}
    token, otp = issue_challenge(db, current_user, OtpPurpose.PASSWORD_CHANGE)
    db.commit()
    try:
        await send_otp_email(current_user.email, otp)
    except Exception:
        raise HTTPException(502, "Unable to deliver the verification email.") from None
    return {"message": "Verification code sent to your email.", "email": current_user.email, "challengeToken": token}


@router.post("/change-password-verify", response_model=LoginResponse)
def verify_password_change(payload: PasswordChangeVerify, db: Session = Depends(get_db), current_user: User = Depends(verify_role(["admin"]))):
    from backend.utils.account_changes import change_password
    return change_password(db, current_user, payload)


@router.get("/access-controls", response_model=TeacherAccessResponse)
@router.get("/me/access", response_model=TeacherAccessResponse)
def get_teacher_access(db: Session = Depends(get_db), current_user: User = Depends(verify_role(["admin"]))):
    from backend.utils.access import current_teacher
    teacher = current_teacher(db, current_user)
    assignment = db.query(SectionTeacher).filter_by(teacher_id=teacher.teacher_id, status="Active").order_by((SectionTeacher.role == "Primary Adviser").desc()).first()
    section = db.get(Section, assignment.section_id) if assignment else None
    return {**{key: bool(getattr(teacher, key)) for key in ParentPermissionUpdate.model_fields},
            "allow_eccd_question_management": bool(teacher.allow_eccd_question_management),
            "section_id": section.section_id if section else None, "section_name": section.section_name if section else None,
            "class_name": section.section_name if section else None}


@router.put("/access-controls", response_model=MessageResult)
@router.put("/me/access", response_model=MessageResult)
def update_teacher_access(payload: ParentPermissionUpdate, db: Session = Depends(get_db), current_user: User = Depends(verify_role(["admin"]))):
    from backend.utils.access import current_teacher
    teacher = current_teacher(db, current_user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is None:
            raise HTTPException(422, "Parent permissions must be true or false.")
        setattr(teacher, key, value)
    db.commit()
    return {"message": "Access controls updated."}


@router.get("/download/{lrn}")
def download_student_assessment(lrn: str, db: Session = Depends(get_db), current_user=Depends(verify_role(["admin", "super-admin"]))):
    from backend.utils.excel import checklist_response
    return checklist_response(db, current_user, lrn)


@router.get("/download-all")
def download_all_assessments(db: Session = Depends(get_db), current_user=Depends(verify_role(["admin", "super-admin"]))):
    from backend.utils.excel import bulk_checklist_response
    return bulk_checklist_response(db, current_user)


@router.put("/{user_id}", response_model=MessageResult)
@router.put("/update/{user_id}", response_model=MessageResult)
def update_teacher(user_id: int, payload: TeacherUpdate, db: Session = Depends(get_db), current_user: User = Depends(verify_role(["super-admin"]))):
    from backend.utils.teachers import assign_teacher
    teacher = db.query(Teacher).filter_by(user_id=user_id).first()
    if teacher is None:
        raise HTTPException(404, "Teacher not found.")
    data = payload.model_dump(exclude_unset=True)
    for key in ("username", "email"):
        if key in data and data[key] is not None:
            duplicate = db.query(User).filter(getattr(User, key) == data[key], User.user_id != user_id).first()
            if duplicate:
                raise HTTPException(400, "Username or email is already in use.")
            if getattr(teacher.user, key) != data[key]:
                from backend.utils.authentication import revoke_credentials
                revoke_credentials(db, teacher.user)
                setattr(teacher.user, key, data[key])
    for key in ("first_name", "last_name", "employee_id"):
        if key in data:
            setattr(teacher, key, data[key])
    if "class_name" in data:
        if data["class_name"]:
            section = db.query(Section).filter_by(section_name=data["class_name"]).first()
            if section is None:
                section = Section(section_name=data["class_name"])
                db.add(section)
                db.flush()
            assign_teacher(db, current_user, section.section_id, teacher.teacher_id)
        else:
            for assignment in db.query(SectionTeacher).filter_by(teacher_id=teacher.teacher_id, status="Active"):
                assignment.status = "Inactive"
            for section in db.query(Section).filter_by(adviser_teacher_id=teacher.teacher_id):
                section.adviser_teacher_id = None
            teacher.class_name = None
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Username, email or employee ID is already in use.") from None
    return {"message": "Teacher successfully updated."}


@router.put("/{user_id}/archive", response_model=MessageResult)
@router.put("/archive/{user_id}", response_model=MessageResult)
def archive_teacher(user_id: int, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    user = db.query(User).filter_by(user_id=user_id, role=UserRole.ADMIN).first()
    if user is None:
        raise HTTPException(404, "Teacher not found.")
    user.is_active = False
    from backend.utils.authentication import revoke_credentials
    revoke_credentials(db, user)
    db.commit()
    return {"message": "Teacher archived."}


@router.put("/{user_id}/unarchive", response_model=MessageResult)
@router.put("/unarchive/{user_id}", response_model=MessageResult)
def unarchive_teacher(user_id: int, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    user = db.query(User).filter_by(user_id=user_id, role=UserRole.ADMIN).first()
    if user is None:
        raise HTTPException(404, "Teacher not found.")
    user.is_active = True
    from backend.utils.authentication import revoke_credentials
    revoke_credentials(db, user)
    db.commit()
    return {"message": "Teacher unarchived."}


@router.delete("/{user_id}", response_model=MessageResult)
@router.delete("/delete/{user_id}", response_model=MessageResult)
def delete_teacher(user_id: int, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    user = db.query(User).filter_by(user_id=user_id, role=UserRole.ADMIN).first()
    if user is None:
        raise HTTPException(404, "Teacher not found.")
    db.delete(user)
    db.commit()
    return {"message": "Teacher permanently deleted."}

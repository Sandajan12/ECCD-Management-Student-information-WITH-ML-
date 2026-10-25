from backend.schemas.account import PasswordChangeRequest, PasswordChangeVerify, ChallengeResult
from backend.schemas.auth import LoginResponse
from backend.schemas.common import MessageResult, PositiveId
from backend.schemas.teacher import ParentPermissionUpdate, TeacherAccessResponse, TeacherProvisionRequest, TeacherProvisionResponse, TeacherSettingsResponse, TeacherSettingsUpdate

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
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from backend.schemas.operations import ImportResult, TeacherListItem
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from backend.utils.account_identity import account_display_name


router = APIRouter(prefix="/api/teachers", tags=["Teachers"])
student_router = APIRouter(prefix="/api/teacher", tags=["Teacher students"])

from backend.schemas.assessment_access import ParentAssessmentAccess, SectionAssessmentAccess
from backend.utils.assessment_access import teacher_access_section, window_values


@student_router.get("/settings/parent-assessment-access", response_model=SectionAssessmentAccess)
def get_parent_assessment_access(section_id: PositiveId | None = None, db: Session = Depends(get_db), current_user: User = Depends(verify_role(["admin"]))):
    section = teacher_access_section(db, current_user, section_id)
    return {"section_id": section.section_id, **window_values(section)}


@student_router.put("/settings/parent-assessment-access", response_model=SectionAssessmentAccess)
def update_parent_assessment_access(payload: ParentAssessmentAccess, section_id: PositiveId | None = None, db: Session = Depends(get_db), current_user: User = Depends(verify_role(["admin"]))):
    section = teacher_access_section(db, current_user, section_id)
    for key, value in payload.model_dump().items():
        setattr(section, key, value)
    result = {"section_id": section.section_id, **window_values(section)}
    from backend.utils.audit import record_audit
    record_audit(db, current_user, "PARENT_ASSESSMENT_ACCESS",
                 f'Updated parent assessment windows for Section "{section.section_name}": {payload.model_dump()}',
                 sectionId=section.section_id, sectionName=section.section_name)
    db.commit()
    return result

from backend.schemas.student import ParentLinkActionRequest, ParentLinkActionResponse, TeacherStudentResponse


@router.get("/students", response_model=list[TeacherStudentResponse])
@student_router.get("/students", response_model=list[TeacherStudentResponse])
def teacher_students(db: Session = Depends(get_db), current_user: User = Depends(verify_role(["admin"]))):
    from backend.routes.students import roster
    return roster(db, current_user, True)


def change_parent_link(db: Session, user: User, student_id: int, payload: ParentLinkActionRequest | None, action: str) -> dict:
    from datetime import datetime, timezone
    from backend.models import FamilyAccess, Parent, Student
    from backend.utils.access import authorize_student
    from backend.utils.parent_links import selected_link
    student = db.query(Student).filter_by(student_id=student_id).with_for_update().first()
    if student is None:
        raise HTTPException(404, "Student not found.")
    authorize_student(db, user, student)
    expected = "SYNCED" if action == "unlink" else "PENDING"
    link, parent, account = selected_link(db, student_id, payload.parent_id if payload else None, expected)
    if action == "approve":
        if not student.is_active:
            raise HTTPException(409, "An archived student's parent link cannot be approved.")
        if not account.is_active:
            raise HTTPException(409, "The requesting parent account is inactive.")
        if db.query(FamilyAccess).join(Parent).filter(FamilyAccess.student_id == student_id, FamilyAccess.status == "SYNCED", Parent.user_id.isnot(None)).first():
            raise HTTPException(409, "This student already has a synced parent.")
        link.status, link.date_linked = "SYNCED", datetime.now(timezone.utc)
        event, preposition, message = "Approved Parent Link", "for", "Parent link approved successfully."
    else:
        db.delete(link)
        event, preposition, message = ("Unlinked Parent", "from", "Parent account successfully unlinked.") if action == "unlink" else ("Rejected Parent Link", "for", "Parent link request declined.")
    parent_name = account_display_name(account)
    student_name = " ".join(value for value in (student.first_name, student.middle_name, student.last_name) if value)
    from backend.utils.audit import record_audit
    record_audit(db, user, event, f'{event}: Parent "{parent_name}" {preposition} Student "{student_name}".',
                 parentId=parent.parent_id, parentName=parent_name, studentId=student.student_id, studentName=student_name)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"success": True, "message": message}


@router.post("/students/{student_id}/unlink-parent", response_model=ParentLinkActionResponse)
def unlink_parent(student_id: PositiveId, payload: ParentLinkActionRequest | None = None, db: Session = Depends(get_db), current_user: User = Depends(verify_role(["admin"]))):
    return change_parent_link(db, current_user, student_id, payload, "unlink")


@router.post("/students/{student_id}/approve-parent-link", response_model=ParentLinkActionResponse)
def approve_parent_link(student_id: PositiveId, payload: ParentLinkActionRequest | None = None, db: Session = Depends(get_db), current_user: User = Depends(verify_role(["admin"]))):
    return change_parent_link(db, current_user, student_id, payload, "approve")


@router.post("/students/{student_id}/reject-parent-link", response_model=ParentLinkActionResponse)
def reject_parent_link(student_id: PositiveId, payload: ParentLinkActionRequest | None = None, db: Session = Depends(get_db), current_user: User = Depends(verify_role(["admin"]))):
    return change_parent_link(db, current_user, student_id, payload, "reject")

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
    from backend.utils.uploads import EXCEL_LIMIT, read_upload
    content = await read_upload(file, EXCEL_LIMIT)
    return await run_in_threadpool(import_students, db, current_user, content, section_id)


@router.get("/active", response_model=list[TeacherListItem])
@router.get("/", response_model=list[TeacherListItem])
def get_teachers(
    active: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["super-admin", "chairman", "admin", "teacher"])),
):
    # Prefer the just-assigned class when a teacher advises several sections,
    # but only if it still has an active assignment. Never expose stale labels.
    displayed_assignment = (
        db.query(SectionTeacher.id)
        .join(Section, Section.section_id == SectionTeacher.section_id)
        .filter(SectionTeacher.teacher_id == Teacher.teacher_id,
                SectionTeacher.status == "Active", SectionTeacher.role == "Primary Adviser")
        .order_by((Section.section_name == Teacher.class_name).desc().nullslast(), SectionTeacher.id.desc())
        .limit(1)
        .correlate(Teacher)
        .scalar_subquery()
    )
    query = (
        db.query(Teacher, User, SectionTeacher, Section)
        .join(User, Teacher.user_id == User.user_id)
        .outerjoin(SectionTeacher, SectionTeacher.id == displayed_assignment)
        .outerjoin(Section, Section.section_id == SectionTeacher.section_id)
        .filter(User.is_active == active)
        .order_by(Teacher.teacher_id)
    )
    results = []
    for teacher, user, assignment, section in query.all():
        sec_name = section.section_name if section else None
        sec_id = section.section_id if section else None
        sec_role = assignment.role if assignment else None

        results.append(
            {
                "teacher_id": teacher.teacher_id,
                "user_id": user.user_id,
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
    from backend.utils.authentication import discard_failed_challenge, issue_challenge
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
        discard_failed_challenge(db, token)
        raise HTTPException(502, "Unable to deliver the verification email.") from None
    return {"message": "Verification code sent to your email.", "email": current_user.email, "challengeToken": token}


@router.post("/change-password-verify", response_model=LoginResponse)
def verify_password_change(payload: PasswordChangeVerify, response: Response, db: Session = Depends(get_db), current_user: User = Depends(verify_role(["admin"]))):
    from backend.utils.account_changes import change_password
    from backend.utils.authentication import clear_device_cookies
    result = change_password(db, current_user, payload)
    clear_device_cookies(response)
    return result


@router.get("/access-controls", response_model=TeacherAccessResponse)
@router.get("/me/access", response_model=TeacherAccessResponse)
@router.get("/settings", response_model=TeacherSettingsResponse)
def get_teacher_access(db: Session = Depends(get_db), current_user: User = Depends(verify_role(["admin"]))):
    from backend.utils.access import current_teacher
    teacher = current_teacher(db, current_user)
    assignment = db.query(SectionTeacher).filter_by(teacher_id=teacher.teacher_id, role="Primary Adviser", status="Active").order_by(SectionTeacher.id).first()
    section = db.get(Section, assignment.section_id) if assignment else None
    return {**{key: bool(getattr(teacher, key, False)) for key in ParentPermissionUpdate.model_fields},
            "allow_eccd_question_management": bool(teacher.allow_eccd_question_management),
            "section_id": section.section_id if section else None, "section_name": section.section_name if section else None,
            "class_name": section.section_name if section else None}


@router.put("/access-controls", response_model=MessageResult)
@router.put("/me/access", response_model=MessageResult)
def update_teacher_access(payload: TeacherSettingsUpdate, db: Session = Depends(get_db), current_user: User = Depends(verify_role(["admin"]))):
    from backend.utils.access import current_teacher
    teacher = current_teacher(db, current_user)
    updates = payload.model_dump(exclude_unset=True)
    for value in updates.values():
        if value is None:
            raise HTTPException(422, "Parent permissions must be true or false.")
    for key, value in updates.items():
        setattr(teacher, key, value)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"message": "Access controls updated."}


@router.put("/settings", response_model=TeacherSettingsResponse)
def update_teacher_settings(payload: TeacherSettingsUpdate, db: Session = Depends(get_db), current_user: User = Depends(verify_role(["admin"]))):
    update_teacher_access(payload, db, current_user)
    return get_teacher_access(db, current_user)


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
    try:
        return _update_teacher(user_id, payload, db, current_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Email or employee ID is already in use.") from None
    except Exception:
        db.rollback()
        raise


def _update_teacher(user_id: int, payload: TeacherUpdate, db: Session, current_user: User):
    from backend.utils.teachers import assign_teacher, lock_teacher_assignments
    lock_teacher_assignments(db)
    teacher = db.query(Teacher).filter_by(user_id=user_id).first()
    if teacher is None:
        raise HTTPException(404, "Teacher not found.")
    data = payload.model_dump(exclude_unset=True)
    if data.get("employee_id") and db.query(Teacher).filter(
        Teacher.employee_id == data["employee_id"], Teacher.teacher_id != teacher.teacher_id,
    ).first():
        raise HTTPException(400, "Employee ID is already assigned to another teacher.")
    if data.get("email") is not None:
        email = str(data["email"]).strip().lower()
        if db.query(User).filter(func.lower(User.email) == email, User.user_id != user_id).first():
            raise HTTPException(400, "Email is already in use.")
        if teacher.user.email != email:
            from backend.utils.authentication import revoke_credentials
            revoke_credentials(db, teacher.user)
            teacher.user.email = email
    for key in ("first_name", "last_name", "employee_id"):
        if key in data:
            setattr(teacher, key, data[key])
    if data.get("class_name") or data.get("section_id"):
        if data.get("class_name"):
            section = db.query(Section).filter_by(section_name=data["class_name"]).first()
            if section is None:
                section = Section(section_name=data["class_name"])
                db.add(section)
                db.flush()
            assign_teacher(db, current_user, section.section_id, teacher.teacher_id)
        else:
            assign_teacher(db, current_user, data["section_id"], teacher.teacher_id)
    elif "class_name" in data:
        for assignment in db.query(SectionTeacher).filter_by(teacher_id=teacher.teacher_id, status="Active"):
            assignment.status = "Inactive"
        for section in db.query(Section).filter_by(adviser_teacher_id=teacher.teacher_id):
            section.adviser_teacher_id = None
        teacher.class_name = None
    db.commit()
    return {"message": "Teacher successfully updated."}


@router.put("/{user_id}/archive", response_model=MessageResult)
@router.put("/archive/{user_id}", response_model=MessageResult)
def archive_teacher(user_id: int, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.teachers import lock_teacher_assignments
    lock_teacher_assignments(db)
    user = db.query(User).filter_by(user_id=user_id, role=UserRole.ADMIN).first()
    if user is None:
        raise HTTPException(404, "Teacher not found.")
    user.is_active = False
    teacher = db.query(Teacher).filter_by(user_id=user_id).first()
    if teacher:
        db.query(SectionTeacher).filter_by(teacher_id=teacher.teacher_id, status="Active").update({"status": "Inactive"}, synchronize_session=False)
        db.query(Section).filter_by(adviser_teacher_id=teacher.teacher_id).update({"adviser_teacher_id": None}, synchronize_session=False)
        teacher.class_name = None
    from backend.utils.authentication import revoke_credentials
    revoke_credentials(db, user)
    from backend.utils.audit import record_audit, teacher_name
    name = teacher_name(teacher) if teacher else account_display_name(user)
    record_audit(db, current_user, "TEACHER_ARCHIVED", f'Archived Teacher account for "{name}"; released active section assignments.',
                 teacherId=teacher.teacher_id if teacher else None, teacherName=name)
    db.commit()
    return {"message": "Teacher archived."}


@router.put("/{user_id}/unarchive", response_model=MessageResult)
@router.put("/unarchive/{user_id}", response_model=MessageResult)
def unarchive_teacher(user_id: int, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.teachers import lock_teacher_assignments
    lock_teacher_assignments(db)
    user = db.query(User).filter_by(user_id=user_id, role=UserRole.ADMIN).first()
    if user is None:
        raise HTTPException(404, "Teacher not found.")
    user.is_active = True
    from backend.utils.authentication import revoke_credentials
    revoke_credentials(db, user)
    from backend.utils.audit import record_audit, teacher_name
    teacher = db.query(Teacher).filter_by(user_id=user_id).first()
    name = teacher_name(teacher) if teacher else account_display_name(user)
    record_audit(db, current_user, "TEACHER_RESTORED", f'Restored Teacher account for "{name}"; section assignment requires manual selection.',
                 teacherId=teacher.teacher_id if teacher else None, teacherName=name)
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

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.models.user import User
from backend.models.email_verification import EmailVerification
from backend.schemas.account import VerifyPasswordRequest, AccountUpdateRequest
from backend.utils.security import verify_password, get_password_hash
from backend.utils.deps import verify_role

router = APIRouter(prefix="/api/chairman", tags=["Chairman"])


@router.post("/verify-password")
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


@router.put("/account")
def update_account(
    request: AccountUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin"])),
):
    user = db.query(User).filter(User.user_id == current_user.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # 1. Verify current password
    if not verify_password(request.currentPassword, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect current password.")

    email_to_update = user.email

    # 2. Handle email update
    if request.newEmail and request.newEmail != user.email:
        # Check if email exists for another user
        existing = db.query(User).filter(User.email == request.newEmail, User.user_id != user.user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email is already taken.")

        if not request.otp:
            return JSONResponse(status_code=400, content={"detail": "OTP is required to change email.", "requireOtp": True})

        # Verify OTP
        now = datetime.now(timezone.utc)
        verification = (
            db.query(EmailVerification)
            .filter(
                EmailVerification.email == request.newEmail,
                EmailVerification.otp == request.otp,
                EmailVerification.expires_at > now,
            )
            .order_by(EmailVerification.id.desc())
            .first()
        )

        if not verification:
            raise HTTPException(status_code=400, detail="Invalid or expired OTP.")

        # Delete the verification to prevent reuse
        db.delete(verification)
        email_to_update = request.newEmail

    # 3. Handle password update
    password_to_update = user.password_hash
    if request.newPassword:
        if (
            len(request.newPassword) < 8
            or not re.search(r"[A-Z]", request.newPassword)
            or not re.search(r"[a-z]", request.newPassword)
            or not re.search(r"[0-9]", request.newPassword)
        ):
            raise HTTPException(
                status_code=400,
                detail="Password must be at least 8 characters long and contain an uppercase letter, a lowercase letter, and a number.",
            )
        password_to_update = get_password_hash(request.newPassword)

    # 4. Save updates
    user.email = email_to_update
    user.password_hash = password_to_update
    db.commit()

    return {"message": "Account updated successfully.", "email": email_to_update}


from backend.models.teacher import Teacher
from backend.models.section import Section
from backend.models.section_teacher import SectionTeacher
from backend.models.student import Student
from backend.models.log import SystemLog
from backend.schemas.teacher import TeacherPermissionUpdate, AssignTeacherSectionRequest
from backend.schemas.student import StudentTransferRequest


@router.put("/teachers/{teacher_id}/permissions")
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


@router.put("/students/transfer")
def transfer_students(
    payload: StudentTransferRequest,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "chairman"])),
):
    if not payload.lrn_numbers:
        raise HTTPException(
            status_code=400, detail="lrn_numbers must be a non-empty list."
        )

    sec = db.query(Section).filter(Section.section_id == payload.new_section_id).first()
    if not sec:
        raise HTTPException(
            status_code=404, detail="Destination section does not exist."
        )

    updated_count = (
        db.query(Student)
        .filter(Student.lrn_number.in_(payload.lrn_numbers))
        .update(
            {"section_id": payload.new_section_id, "section_name": sec.section_name},
            synchronize_session=False,
        )
    )

    action_log = SystemLog(
        user_id=current_user.user_id,
        action_type="TRANSFER_STUDENTS",
        details=f"Transferred {updated_count} student(s) to section {sec.section_name} (ID: {payload.new_section_id})",
    )
    db.add(action_log)
    db.commit()

    return {
        "message": f"Successfully transferred {updated_count} student(s) to section {sec.section_name}.",
        "transferred_count": updated_count,
    }


@router.post("/sections/{section_id}/assign-teacher")
@router.put("/sections/{section_id}/assign")
def assign_teacher_to_section(
    section_id: int,
    payload: AssignTeacherSectionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "chairman"])),
):
    section = db.query(Section).filter(Section.section_id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found.")

    incoming_teacher_id = payload.teacher_id

    try:
        # 1. Identify incumbent teacher currently assigned to this section
        incumbent_teacher_id = section.adviser_teacher_id
        if not incumbent_teacher_id:
            active_st = (
                db.query(SectionTeacher)
                .filter(
                    SectionTeacher.section_id == section_id,
                    SectionTeacher.status == "Active",
                )
                .first()
            )
            if active_st:
                incumbent_teacher_id = active_st.teacher_id

        # 2. If an incumbent teacher exists and is DIFFERENT from incoming teacher, detach and archive them
        incumbent_archived_name = None
        if incumbent_teacher_id and incumbent_teacher_id != incoming_teacher_id:
            incumbent_teacher = (
                db.query(Teacher)
                .filter(Teacher.teacher_id == incumbent_teacher_id)
                .first()
            )
            if incumbent_teacher:
                incumbent_archived_name = f"{incumbent_teacher.first_name or ''} {incumbent_teacher.last_name or ''}".strip()
                # Detach from section
                incumbent_teacher.class_name = None

                # Deactivate all active assignments in section_teachers for incumbent
                db.query(SectionTeacher).filter(
                    SectionTeacher.teacher_id == incumbent_teacher_id,
                    SectionTeacher.status == "Active",
                ).update({"status": "Inactive"}, synchronize_session=False)

                # Archive incumbent teacher account by setting users.is_active = False
                incumbent_user = (
                    db.query(User)
                    .filter(User.user_id == incumbent_teacher.user_id)
                    .first()
                )
                if incumbent_user:
                    incumbent_user.is_active = False

        # 3. Assign the new incoming teacher
        if incoming_teacher_id:
            incoming_teacher = (
                db.query(Teacher)
                .filter(Teacher.teacher_id == incoming_teacher_id)
                .first()
            )
            if not incoming_teacher:
                raise HTTPException(status_code=404, detail="Incoming teacher not found.")

            # Ensure incoming teacher's user account is Active (unarchived)
            incoming_user = (
                db.query(User)
                .filter(User.user_id == incoming_teacher.user_id)
                .first()
            )
            if incoming_user:
                incoming_user.is_active = True

            # Deactivate any previous active section assignments for the incoming teacher
            db.query(SectionTeacher).filter(
                SectionTeacher.teacher_id == incoming_teacher_id,
                SectionTeacher.status == "Active",
            ).update({"status": "Inactive"}, synchronize_session=False)

            # Assign to this section
            section.adviser_teacher_id = incoming_teacher_id
            incoming_teacher.class_name = section.section_name

            # Upsert active SectionTeacher record
            assignment = (
                db.query(SectionTeacher)
                .filter(
                    SectionTeacher.section_id == section_id,
                    SectionTeacher.teacher_id == incoming_teacher_id,
                )
                .first()
            )
            if assignment:
                assignment.status = "Active"
                assignment.role = "Primary Adviser"
            else:
                assignment = SectionTeacher(
                    section_id=section_id,
                    teacher_id=incoming_teacher_id,
                    role="Primary Adviser",
                    status="Active",
                )
                db.add(assignment)

            # Audit log
            log_detail = f"Assigned Teacher {incoming_teacher.first_name} {incoming_teacher.last_name} to section {section.section_name}."
            if incumbent_archived_name:
                log_detail += f" Previous teacher {incumbent_archived_name} was detached and archived (status set to Inactive)."

            action_log = SystemLog(
                user_id=current_user.user_id,
                action_type="SECTION_HANDOVER_REASSIGNMENT",
                details=log_detail[:255],
            )
            db.add(action_log)
        else:
            # Unassigning section completely
            section.adviser_teacher_id = None
            db.query(SectionTeacher).filter(
                SectionTeacher.section_id == section_id,
                SectionTeacher.status == "Active",
            ).update({"status": "Inactive"}, synchronize_session=False)

        # 4. Atomic Commit
        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to assign teacher and complete archiving handover: {str(e)}",
        )

    msg = "Teacher successfully assigned to section."
    if incumbent_archived_name:
        msg = f"Teacher successfully assigned to section {section.section_name}. Previous adviser ({incumbent_archived_name}) was archived."

    return {
        "message": msg,
        "section_id": section_id,
        "archived_teacher": incumbent_archived_name,
    }


@router.get("/sections")
def get_chairman_sections(
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "chairman"])),
):
    sections = db.query(Section).order_by(Section.section_name.asc()).all()
    results = []
    for sec in sections:
        active_assignment = (
            db.query(SectionTeacher)
            .filter(
                SectionTeacher.section_id == sec.section_id,
                SectionTeacher.status == "Active",
            )
            .order_by((SectionTeacher.role == "Primary Adviser").desc())
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
            }
        )
    return results


@router.get("/teachers")
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


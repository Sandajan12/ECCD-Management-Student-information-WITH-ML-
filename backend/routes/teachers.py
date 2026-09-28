
from backend.config.database import get_db
from backend.models.section import Section
from backend.models.section_teacher import SectionTeacher
from backend.models.teacher import Teacher
from backend.models.user import User, UserRole
from backend.schemas.teacher import (
    TeacherCreateWithUser,
    TeacherUpdate,
    TeacherUpdateAccess,
)
from backend.utils.deps import verify_role
from backend.utils.security import get_password_hash, verify_password
from backend.models.email_verification import EmailVerification
from backend.utils.email import send_otp_email
import fastapi_mail
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
import re
import random
from datetime import datetime, timedelta, timezone

class PasswordChangeRequest(BaseModel):
    oldPassword: str

class PasswordChangeVerify(BaseModel):
    email: str
    otp: str
    newPassword: str

router = APIRouter(prefix="/api/teachers", tags=["Teachers"])


@router.get("/active", response_model=list[dict])
@router.get("/", response_model=list[dict])
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


@router.post("/", status_code=201)
def create_teacher(
    payload: TeacherCreateWithUser,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["super-admin", "chairman"])),
):
    pwd = payload.password
    if len(pwd) < 8 or not re.search(r"[A-Z]", pwd) or not re.search(r"[a-z]", pwd) or not re.search(r"[0-9]", pwd):
        raise HTTPException(
            status_code=400, 
            detail="Password must be at least 8 characters long and contain an uppercase letter, a lowercase letter, and a number."
        )

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists.")

    username = payload.email.split("@")[0]
    hashed_password = get_password_hash(payload.password)
    
    new_user = User(
        username=username,
        email=payload.email,
        password_hash=hashed_password,
        role=UserRole.ADMIN,
        is_active=True,
    )
    db.add(new_user)
    db.flush() 

    new_teacher = Teacher(
        user_id=new_user.user_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        employee_id=payload.employee_id,
        class_name=payload.class_name,
        allow_eccd_question_management=False,
    )
    db.add(new_teacher)
    db.flush()
    
    if payload.class_name:
        section = (
            db.query(Section).filter(Section.section_name == payload.class_name).first()
        )
        if not section:
            section = Section(section_name=payload.class_name)
            db.add(section)
            db.flush()
        else:
            # Check for incumbent teacher assigned to this section
            incumbent_id = section.adviser_teacher_id
            if not incumbent_id:
                st = (
                    db.query(SectionTeacher)
                    .filter(
                        SectionTeacher.section_id == section.section_id,
                        SectionTeacher.status == "Active",
                    )
                    .first()
                )
                if st:
                    incumbent_id = st.teacher_id

            if incumbent_id and incumbent_id != new_teacher.teacher_id:
                incumbent = db.query(Teacher).filter(Teacher.teacher_id == incumbent_id).first()
                if incumbent:
                    incumbent.class_name = None
                    db.query(SectionTeacher).filter(
                        SectionTeacher.teacher_id == incumbent_id,
                        SectionTeacher.status == "Active",
                    ).update({"status": "Inactive"}, synchronize_session=False)
                    inc_u = db.query(User).filter(User.user_id == incumbent.user_id).first()
                    if inc_u:
                        inc_u.is_active = False

        assignment = SectionTeacher(
            section_id=section.section_id,
            teacher_id=new_teacher.teacher_id,
            role="Primary Adviser",
            status="Active",
        )
        db.add(assignment)
        section.adviser_teacher_id = new_teacher.teacher_id

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="An account with this Employee ID or Email already exists.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create teacher: {str(e)}")

    return {"message": "Teacher successfully created."}


@router.post("/change-password-request")
async def request_password_change(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["admin", "teacher", "super-admin", "chairman"])),
):
    user = db.query(User).filter(User.user_id == current_user.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if not verify_password(payload.oldPassword, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect old password.")

    otp = str(random.randint(100000, 999999))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)

    verification = EmailVerification(email=user.email, otp=otp, expires_at=expires_at)
    db.add(verification)
    db.commit()

    try:
        await send_otp_email(user.email, otp)
        return {"message": "Verification code sent to your email.", "email": user.email}
    except (fastapi_mail.errors.ConnectionErrors, Exception) as e:
        print(f"Email Sending Error: {str(e)}")
        raise HTTPException(
            status_code=502,
            detail="Unable to send OTP email. Please check server email credentials."
        )


@router.post("/change-password-verify")
def verify_password_change(
    payload: PasswordChangeVerify,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["admin", "teacher", "super-admin", "chairman"])),
):
    pwd = payload.newPassword
    if len(pwd) < 8 or not re.search(r"[A-Z]", pwd) or not re.search(r"[a-z]", pwd) or not re.search(r"[0-9]", pwd):
        raise HTTPException(
            status_code=400, 
            detail="Password must be at least 8 characters long and contain an uppercase letter, a lowercase letter, and a number."
        )
    
    verification = (
        db.query(EmailVerification)
        .filter(EmailVerification.email == payload.email, EmailVerification.otp == payload.otp)
        .order_by(EmailVerification.id.desc())
        .first()
    )

    if not verification:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
    
    if verification.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invalid or expired verification code.")

    hashed_password = get_password_hash(payload.newPassword)
    
    user = db.query(User).filter(User.user_id == current_user.user_id).first()
    user.password_hash = hashed_password
    
    db.query(EmailVerification).filter(EmailVerification.email == payload.email).delete()
    db.commit()

    return {"message": "Password successfully updated!"}


@router.put("/{user_id}")
def update_teacher(
    user_id: int,
    payload: TeacherUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["super-admin", "chairman"])),
):
    teacher = db.query(Teacher).filter(Teacher.user_id == user_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    if payload.first_name is not None:
        teacher.first_name = payload.first_name
    if payload.last_name is not None:
        teacher.last_name = payload.last_name
    if payload.employee_id is not None:
        teacher.employee_id = payload.employee_id
    if payload.class_name is not None:
        teacher.class_name = payload.class_name
        if payload.class_name:
            section = (
                db.query(Section).filter(Section.section_name == payload.class_name).first()
            )
            if not section:
                section = Section(section_name=payload.class_name)
                db.add(section)
                db.flush()
            else:
                # Archive incumbent teacher if different from this teacher
                incumbent_id = section.adviser_teacher_id
                if not incumbent_id:
                    st = (
                        db.query(SectionTeacher)
                        .filter(
                            SectionTeacher.section_id == section.section_id,
                            SectionTeacher.status == "Active",
                        )
                        .first()
                    )
                    if st:
                        incumbent_id = st.teacher_id

                if incumbent_id and incumbent_id != teacher.teacher_id:
                    incumbent = db.query(Teacher).filter(Teacher.teacher_id == incumbent_id).first()
                    if incumbent:
                        incumbent.class_name = None
                        db.query(SectionTeacher).filter(
                            SectionTeacher.teacher_id == incumbent_id,
                            SectionTeacher.status == "Active",
                        ).update({"status": "Inactive"}, synchronize_session=False)
                        inc_u = db.query(User).filter(User.user_id == incumbent.user_id).first()
                        if inc_u:
                            inc_u.is_active = False

            # Deactivate teacher's active assignments in other sections
            db.query(SectionTeacher).filter(
                SectionTeacher.teacher_id == teacher.teacher_id,
                SectionTeacher.status == "Active",
                SectionTeacher.section_id != section.section_id,
            ).update({"status": "Inactive"}, synchronize_session=False)

            existing_st = (
                db.query(SectionTeacher)
                .filter(
                    SectionTeacher.teacher_id == teacher.teacher_id,
                    SectionTeacher.section_id == section.section_id,
                )
                .first()
            )
            if existing_st:
                existing_st.role = "Primary Adviser"
                existing_st.status = "Active"
            else:
                db.add(
                    SectionTeacher(
                        section_id=section.section_id,
                        teacher_id=teacher.teacher_id,
                        role="Primary Adviser",
                        status="Active",
                    )
                )
            section.adviser_teacher_id = teacher.teacher_id
        else:
            db.query(SectionTeacher).filter(
                SectionTeacher.teacher_id == teacher.teacher_id,
                SectionTeacher.status == "Active",
            ).update({"status": "Inactive"}, synchronize_session=False)
            section_to_clear = (
                db.query(Section)
                .filter(Section.adviser_teacher_id == teacher.teacher_id)
                .first()
            )
            if section_to_clear:
                section_to_clear.adviser_teacher_id = None

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update teacher: {str(e)}")
    return {"message": "Teacher successfully updated."}


@router.put("/{user_id}/archive")
def archive_teacher(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["super-admin", "chairman"])),
):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
    return {"message": "Teacher archived."}


@router.put("/{user_id}/unarchive")
def unarchive_teacher(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["super-admin", "chairman"])),
):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = True
    db.commit()
    return {"message": "Teacher unarchived."}


@router.delete("/{user_id}")
def delete_teacher(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["super-admin", "chairman"])),
):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Teacher record will be deleted automatically due to cascade on user
    db.delete(user)
    db.commit()
    return {"message": "Teacher permanently deleted."}


@router.get("/access-controls")
@router.get("/me/access")
def get_teacher_access(
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["admin", "teacher"])),
):
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    
    active_assignment = (
        db.query(SectionTeacher, Section)
        .join(Section, SectionTeacher.section_id == Section.section_id)
        .filter(SectionTeacher.teacher_id == teacher.teacher_id, SectionTeacher.status == "Active")
        .order_by((SectionTeacher.role == "Primary Adviser").desc())
        .first()
    )
    sec_name = active_assignment[1].section_name if active_assignment else teacher.class_name

    return {
        "allow_parent_view_student_info": teacher.allow_parent_view_student_info,
        "allow_parent_view_eccd_pre": teacher.allow_parent_view_eccd_pre,
        "allow_parent_view_eccd_mid": teacher.allow_parent_view_eccd_mid,
        "allow_parent_view_eccd_post": teacher.allow_parent_view_eccd_post,
        "allow_parent_edit_student_info": teacher.allow_parent_edit_student_info,
        "allow_parent_edit_home_based_eccd": teacher.allow_parent_edit_home_based_eccd,
        "allow_parent_view": teacher.allow_parent_view,
        "allow_parent_edit": teacher.allow_parent_edit,
        "allow_parent_home_based_edit": teacher.allow_parent_home_based_edit,
        "allow_eccd_question_management": bool(teacher.allow_eccd_question_management),
        "class_name": sec_name,
        "section_name": sec_name,
    }


@router.put("/access-controls")
@router.put("/me/access")
def update_teacher_access(
    payload: TeacherUpdateAccess,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["admin", "teacher"])),
):
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher profile not found")

    if payload.allow_parent_view_student_info is not None:
        teacher.allow_parent_view_student_info = payload.allow_parent_view_student_info
    elif payload.allow_parent_view is not None:
        teacher.allow_parent_view_student_info = payload.allow_parent_view

    if payload.allow_parent_view_eccd_pre is not None:
        teacher.allow_parent_view_eccd_pre = payload.allow_parent_view_eccd_pre
    if payload.allow_parent_view_eccd_mid is not None:
        teacher.allow_parent_view_eccd_mid = payload.allow_parent_view_eccd_mid
    if payload.allow_parent_view_eccd_post is not None:
        teacher.allow_parent_view_eccd_post = payload.allow_parent_view_eccd_post

    if payload.allow_parent_edit_student_info is not None:
        teacher.allow_parent_edit_student_info = payload.allow_parent_edit_student_info
    elif payload.allow_parent_edit is not None:
        teacher.allow_parent_edit_student_info = payload.allow_parent_edit

    if payload.allow_parent_edit_home_based_eccd is not None:
        teacher.allow_parent_edit_home_based_eccd = payload.allow_parent_edit_home_based_eccd
    elif payload.allow_parent_home_based_edit is not None:
        teacher.allow_parent_edit_home_based_eccd = payload.allow_parent_home_based_edit

    db.commit()
    return {"message": "Access controls updated."}

import io
import zipfile
import openpyxl
from openpyxl.styles import Font
from fastapi.responses import StreamingResponse
from backend.models.eccd import StudentEccdEvaluation, EccdQuestion, TestingPeriod
from backend.models.parent import Parent, FamilyAccess
from backend.models.student import Student
from backend.utils.eccd_scorer import calculate_scores
from datetime import datetime

def get_mapping(domain_id, seq):
    if domain_id == 7: return {"row": 3 + seq, "PRE": ['D','E'], "MID": ['F','G'], "POST": ['H','I']}
    if domain_id == 1: return {"row": 35 + seq, "PRE": ['D','E'], "MID": ['F','G'], "POST": ['H','I']}
    if domain_id == 2: return {"row": 51 + seq, "PRE": ['D','E'], "MID": ['F','G'], "POST": ['H','I']}
    
    if domain_id == 3:
        if seq <= 2: return {"row": 65 + seq, "PRE": ['D','E'], "MID": ['F','G'], "POST": ['H','I']}
        return {"row": 31 + seq, "PRE": ['N','O'], "MID": ['P','Q'], "POST": ['R','S']}
        
    if domain_id == 4: return {"row": 61 + seq, "PRE": ['N','O'], "MID": ['P','Q'], "POST": ['R','S']}
    if domain_id == 5: return {"row": 35 + seq, "PRE": ['X','Y'], "MID": ['Z','AA'], "POST": ['AB','AC']}
    if domain_id == 6: return {"row": 46 + seq, "PRE": ['X','Y'], "MID": ['Z','AA'], "POST": ['AB','AC']}
    return None

def generate_student_workbook(student, teacher, parents, evaluations, questions):
    template_path = r"backend/assets/templates/EasyCD-Checklist-2024-V3.-violet-FEMALE-2024-2025-.xlsx"
    wb = openpyxl.load_workbook(template_path)
    
    for sheet_name in wb.sheetnames:
        if sheet_name != 'CHECKLIST':
            del wb[sheet_name]
            
    ws = wb['CHECKLIST']
    
    def safe_write(coord, value, font=None):
        cell = ws[coord]
        target_cell = cell
        if type(cell).__name__ == 'MergedCell':
            for merged_range in ws.merged_cells.ranges:
                if cell.coordinate in merged_range:
                    target_cell = ws.cell(row=merged_range.min_row, column=merged_range.min_col)
                    break
        target_cell.value = value
        if font:
            target_cell.font = font
            
    safe_write('W10', student.lrn_number or '')
    safe_write('V4', 'NATIONAL CAPITAL REGION')
    safe_write('V5', 'DIVISION OF MANILA')
    safe_write('V6', 'SCHOOL NAME:')
    safe_write('W6', 'APOLINARIO MABINI ELEMENTARY SCHOOL')
    safe_write('V7', 'SCHOOL YEAR:')
    
    current_year = datetime.now().year
    safe_write('W7', f"{current_year}-{current_year + 1}")
    
    safe_write('V8', 'SECTION:')
    safe_write('W8', student.section.section_name.upper() if student.section and student.section.section_name else '')
    
    teacher_name = f"{teacher.first_name or ''} {teacher.last_name or ''}".strip().upper()
    safe_write('V28', teacher_name)
    
    last_name = student.last_name.upper() if student.last_name else ''
    first_name = student.first_name.upper() if student.first_name else ''
    safe_write('W11', f"{last_name}, {first_name}")
    
    if student.date_of_birth:
        safe_write('W12', student.date_of_birth.strftime('%m/%d/%Y'))
    else:
        safe_write('W12', '')
        
    safe_write('W13', student.gender or '')
    safe_write('W17', student.handedness or '')
    safe_write('W18', student.address or '')
    safe_write('W24', student.num_of_siblings if student.num_of_siblings is not None else '')
    safe_write('AA24', student.birth_order or '')
    
    father = next((p for p in parents if p.relationship_type and p.relationship_type.lower() == 'father'), None)
    mother = next((p for p in parents if p.relationship_type and p.relationship_type.lower() == 'mother'), None)
    
    if father:
        safe_write('W20', father.fullname or '')
        safe_write('AB20', father.age or '')
        safe_write('W21', father.occupation or '')
        safe_write('AA21', father.educational_attainment or '')
        
    if mother:
        safe_write('W22', mother.fullname or '')
        safe_write('AB22', mother.age or '')
        safe_write('W23', mother.occupation or '')
        safe_write('AA23', mother.educational_attainment or '')
        
    blocks_to_clear = [
        {"start": 4, "end": 27, "cols": ['D','E','F','G','H','I']},
        {"start": 36, "end": 48, "cols": ['D','E','F','G','H','I']},
        {"start": 52, "end": 62, "cols": ['D','E','F','G','H','I']},
        {"start": 66, "end": 67, "cols": ['D','E','F','G','H','I']},
        {"start": 34, "end": 58, "cols": ['N','O','P','Q','R','S']},
        {"start": 62, "end": 66, "cols": ['N','O','P','Q','R','S']},
        {"start": 36, "end": 43, "cols": ['X','Y','Z','AA','AB','AC']},
        {"start": 47, "end": 67, "cols": ['X','Y','Z','AA','AB','AC']}
    ]
    
    for block in blocks_to_clear:
        for r in range(block['start'], block['end'] + 1):
            for c in block['cols']:
                cell = ws[f"{c}{r}"]
                if type(cell).__name__ == 'MergedCell':
                    continue
                cell.value = None

    for row in ws.iter_rows():
        for cell in row:
            if type(cell).__name__ == 'MergedCell':
                continue
            if isinstance(cell.value, str) and '###' in cell.value:
                cell.value = None

    for q in questions:
        mapping = get_mapping(q.domain_id, q.sequence_order)
        if mapping:
            pre_col = mapping['PRE'][0]
            text_col = 'B'
            if pre_col == 'N': text_col = 'L'
            if pre_col == 'X': text_col = 'V'
            
            safe_write(f"{text_col}{mapping['row']}", q.question_text)

    eval_dates = {}
    for ev in evaluations:
        period = ev.testing_period.value
        if period not in eval_dates or ev.evaluation_date < eval_dates[period]:
            eval_dates[period] = ev.evaluation_date

    raw_scores = {
        'PRE': {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0},
        'MID': {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0},
        'POST': {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0}
    }

    for ev in evaluations:
        mapping = get_mapping(ev.question.domain_id, ev.question.sequence_order)
        if not mapping: continue
        
        target_cols = mapping.get(ev.testing_period.value)
        if target_cols:
            target_col = None
            symbol = ''
            
            if ev.answer.value == 'KAYA':
                target_col = target_cols[0]
                symbol = '✓'
                raw_scores[ev.testing_period.value][ev.question.domain_id] += 1
            elif ev.answer.value == 'DI-KAYA':
                target_col = target_cols[1]
                symbol = 'X'
                
            if target_col:
                safe_write(f"{target_col}{mapping['row']}", symbol, font=Font(name='Arial', size=11, bold=False, color='FF000000'))

    domain_rows = {1: 9, 2: 10, 3: 11, 4: 12, 5: 13, 6: 14, 7: 15}
    period_cols = {'PRE': 'N', 'MID': 'P', 'POST': 'R'}
    
    domain_total_mapping = {
        1: {"row": 49, "PRE": 'D', "MID": 'F', "POST": 'H'},
        2: {"row": 63, "PRE": 'D', "MID": 'F', "POST": 'H'},
        3: {"row": 59, "PRE": 'N', "MID": 'P', "POST": 'R'},
        4: {"row": 67, "PRE": 'N', "MID": 'P', "POST": 'R'},
        5: {"row": 44, "PRE": 'X', "MID": 'Z', "POST": 'AB'},
        6: {"row": 68, "PRE": 'X', "MID": 'Z', "POST": 'AB'},
        7: {"row": 28, "PRE": 'D', "MID": 'F', "POST": 'H'}
    }

    for period in ['PRE', 'MID', 'POST']:
        if period in eval_dates:
            date_obj = eval_dates[period]
            row_idx = None
            edad_row = None
            if period == 'PRE': row_idx = 3; edad_row = 14
            elif period == 'MID': row_idx = 4; edad_row = 15
            elif period == 'POST': row_idx = 5; edad_row = 16
            
            if row_idx:
                safe_write(f"M{row_idx}", date_obj.strftime('%m/%d/%Y'))
                
                if student.date_of_birth:
                    years = date_obj.year - student.date_of_birth.year
                    months = date_obj.month - student.date_of_birth.month
                    if date_obj.day < student.date_of_birth.day:
                        months -= 1
                    if months < 0:
                        years -= 1
                        months += 12
                    decimal_age = round(years + (months / 12.0), 1)
                    
                    safe_write(f"Q{row_idx}", decimal_age)
                    safe_write(f"R{row_idx}", '')
                    safe_write(f"S{row_idx}", '')
                    if edad_row:
                        safe_write(f"Y{edad_row}", decimal_age)
                    
                    period_evals = [{"domain_id": e.question.domain_id, "answer": e.answer.value} for e in evaluations if e.testing_period.value == period]
                    
                    try:
                        scores = calculate_scores(period_evals, decimal_age)
                        
                        raw_col = None
                        scaled_col = None
                        if period == 'PRE': raw_col = 'N'; scaled_col = 'O'
                        elif period == 'MID': raw_col = 'P'; scaled_col = 'Q'
                        elif period == 'POST': raw_col = 'R'; scaled_col = 'S'
                        
                        if raw_col and scaled_col:
                            for dom_id, sum_row in domain_rows.items():
                                dom_code = {1:'GM', 2:'FM', 3:'SH', 4:'RL', 5:'EL', 6:'C', 7:'SE'}[dom_id]
                                safe_write(f"{raw_col}{sum_row}", scores['raw_scores'].get(dom_code, 0))
                                safe_write(f"{scaled_col}{sum_row}", scores['scaled_scores'].get(dom_code, 0))
                                
                            safe_write(f"{scaled_col}16", scores['sum_of_scaled_scores'])
                            safe_write(f"{scaled_col}17", scores['standard_score'])
                            
                            interp_row = 20
                            if period == 'MID': interp_row = 21
                            elif period == 'POST': interp_row = 22
                            safe_write(f"M{interp_row}", scores['interpretation'])
                            
                    except Exception as e:
                        print(f"Scoring error for period {period}:", str(e))

        total_raw = 0
        for domain_id, score in raw_scores[period].items():
            r = domain_rows[domain_id]
            c = period_cols[period]
            safe_write(f"{c}{r}", score, font=Font(name='Arial', size=11, bold=True))
            total_raw += score
            
            if domain_id in domain_total_mapping:
                iskor_row = domain_total_mapping[domain_id]['row']
                iskor_col = domain_total_mapping[domain_id][period]
                safe_write(f"{iskor_col}{iskor_row}", score, font=Font(name='Arial', size=11, bold=True, color='FF000000'))
                
        safe_write(f"{period_cols[period]}16", total_raw, font=Font(name='Arial', size=11, bold=True))

    return wb


@router.get("/download/{lrn}")
def download_student_assessment(
    lrn: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["admin", "teacher"]))
):
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
    if not teacher:
        raise HTTPException(status_code=403, detail="Teacher not found.")

    active_sec_ids = [
        st[0]
        for st in db.query(SectionTeacher.section_id)
        .filter(SectionTeacher.teacher_id == teacher.teacher_id, SectionTeacher.status == "Active")
        .all()
    ]
    legacy_sec_ids = [
        s.section_id
        for s in db.query(Section.section_id)
        .filter(Section.adviser_teacher_id == teacher.teacher_id)
        .all()
    ]
    sec_ids = set(active_sec_ids + legacy_sec_ids)

    student = db.query(Student).filter(Student.lrn_number == lrn).first()
    if not student or student.section_id not in sec_ids:
        raise HTTPException(status_code=403, detail="Student not found in your class.")

    parents = db.query(Parent, FamilyAccess.relationship_type).join(FamilyAccess, Parent.parent_id == FamilyAccess.parent_id).filter(FamilyAccess.student_lrn == lrn).all()
    parent_list = []
    for p, rel in parents:
        p.relationship_type = rel
        parent_list.append(p)

    evaluations = db.query(StudentEccdEvaluation).filter(StudentEccdEvaluation.student_lrn == lrn).all()
    questions = db.query(EccdQuestion).all()

    try:
        wb = generate_student_workbook(student, teacher, parent_list, evaluations, questions)
        
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        
        last_name_str = student.last_name.upper().replace(' ', '_') if student.last_name else 'STUDENT'
        current_year = datetime.now().year
        filename = f"ECCD_ASSESSMENT_{last_name_str}_{current_year}-{current_year+1}.xlsx"
        
        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
        
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers,
        )
    except Exception as e:
        print("Excel download error:", str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download-all")
def download_all_assessments(
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["admin", "teacher"]))
):
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
    if not teacher:
        raise HTTPException(status_code=403, detail="Teacher not found.")

    active_sec_ids = [
        st[0]
        for st in db.query(SectionTeacher.section_id)
        .filter(SectionTeacher.teacher_id == teacher.teacher_id, SectionTeacher.status == "Active")
        .all()
    ]
    legacy_sec_ids = [
        s.section_id
        for s in db.query(Section.section_id)
        .filter(Section.adviser_teacher_id == teacher.teacher_id)
        .all()
    ]
    sec_ids = set(active_sec_ids + legacy_sec_ids)

    students = db.query(Student).filter(Student.section_id.in_(sec_ids), Student.is_active == True).all()
    if not students:
        raise HTTPException(status_code=404, detail="No students found in your class.")

    questions = db.query(EccdQuestion).all()
    
    try:
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
            for student in students:
                parents = db.query(Parent, FamilyAccess.relationship_type).join(FamilyAccess, Parent.parent_id == FamilyAccess.parent_id).filter(FamilyAccess.student_lrn == student.lrn_number).all()
                parent_list = []
                for p, rel in parents:
                    p.relationship_type = rel
                    parent_list.append(p)

                evaluations = db.query(StudentEccdEvaluation).filter(StudentEccdEvaluation.student_lrn == student.lrn_number).all()

                wb = generate_student_workbook(student, teacher, parent_list, evaluations, questions)
                
                excel_buffer = io.BytesIO()
                wb.save(excel_buffer)
                
                last_name_str = student.last_name.upper().replace(' ', '_') if student.last_name else 'STUDENT'
                filename = f"ECCD_ASSESSMENT_{last_name_str}.xlsx"
                
                zip_file.writestr(filename, excel_buffer.getvalue())

        zip_buffer.seek(0)
        
        section_str = students[0].section.section_name.upper().replace(' ', '_') if students[0].section and students[0].section.section_name else 'CLASS'
        current_year = datetime.now().year
        zip_filename = f"ECCD_ASSESSMENT_{section_str}_{current_year}-{current_year+1}.zip"
        
        headers = {
            "Content-Disposition": f'attachment; filename="{zip_filename}"'
        }
        
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers=headers,
        )
    except Exception as e:
        print("Zip download error:", str(e))
        raise HTTPException(status_code=500, detail=str(e))

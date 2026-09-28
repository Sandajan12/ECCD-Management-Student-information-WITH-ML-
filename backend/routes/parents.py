from datetime import date
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.models.eccd import EccdDomain, EccdQuestion, StudentEccdEvaluation, TestingPeriod
from backend.models.log import SystemLog
from backend.models.parent import FamilyAccess, Parent
from backend.models.section import Section
from backend.models.section_teacher import SectionTeacher
from backend.models.student import Student
from backend.models.teacher import Teacher
from backend.models.user import User
from backend.schemas.parent import (
    ChildProfileResponse,
    DomainScoreItem,
    ParentChildUpdateRequest,
    ParentEccdSummaryResponse,
    ParentLinkChildRequest,
    PeriodSummary,
)
from backend.utils.deps import verify_role
from backend.utils.eccd_scorer import calculate_decimal_age, calculate_scores

router = APIRouter(prefix="/api/parents", tags=["Parents"])


def get_active_adviser_for_student(student: Student, db: Session) -> Optional[Teacher]:
    """Retrieve the active primary adviser for the student's section, falling back to section adviser."""
    if not student.section_id:
        return None

    # Check active SectionTeacher with 'Primary Adviser'
    st = (
        db.query(SectionTeacher)
        .filter(
            SectionTeacher.section_id == student.section_id,
            SectionTeacher.status == "Active",
            SectionTeacher.role == "Primary Adviser",
        )
        .first()
    )
    if st and st.teacher:
        return st.teacher

    # Fallback to any active teacher on that section
    st_any = (
        db.query(SectionTeacher)
        .filter(
            SectionTeacher.section_id == student.section_id,
            SectionTeacher.status == "Active",
        )
        .first()
    )
    if st_any and st_any.teacher:
        return st_any.teacher

    # Fallback to section.adviser
    if student.section and student.section.adviser:
        return student.section.adviser

    return None


@router.get("/children", response_model=List[ChildProfileResponse])
def get_parent_children(
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["user", "parent"])),
):
    parent = db.query(Parent).filter(Parent.user_id == current_user.user_id).first()
    if not parent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent profile not found.",
        )

    links = (
        db.query(FamilyAccess)
        .filter(FamilyAccess.parent_id == parent.parent_id)
        .all()
    )
    if not links:
        return []

    results: List[ChildProfileResponse] = []
    seen = set()

    for link in links:
        student = (
            db.query(Student)
            .filter(Student.lrn_number == link.student_lrn, Student.is_active == True)
            .first()
        )
        if not student or student.lrn_number in seen:
            continue
        seen.add(student.lrn_number)

        adviser = get_active_adviser_for_student(student, db)

        # Retrieve Father & Mother details
        father = (
            db.query(Parent)
            .join(FamilyAccess, Parent.parent_id == FamilyAccess.parent_id)
            .filter(
                FamilyAccess.student_lrn == student.lrn_number,
                FamilyAccess.relationship_type == "Father",
            )
            .first()
        )
        mother = (
            db.query(Parent)
            .join(FamilyAccess, Parent.parent_id == FamilyAccess.parent_id)
            .filter(
                FamilyAccess.student_lrn == student.lrn_number,
                FamilyAccess.relationship_type == "Mother",
            )
            .first()
        )

        # Calculate decimal age
        computed_age = None
        if student.date_of_birth:
            computed_age = calculate_decimal_age(student.date_of_birth, date.today())

        section_title = None
        if student.section:
            section_title = student.section.section_name
        elif student.section_name:
            section_title = student.section_name

        results.append(
            ChildProfileResponse(
                lrn_number=student.lrn_number,
                first_name=student.first_name,
                last_name=student.last_name,
                date_of_birth=student.date_of_birth,
                age=computed_age,
                gender=student.gender.value if student.gender else None,
                section_name=section_title,
                teacher_fname=adviser.first_name if adviser else None,
                teacher_lname=adviser.last_name if adviser else None,
                address=student.address,
                handedness=student.handedness.value if student.handedness else None,
                num_of_siblings=student.num_of_siblings,
                birth_order=student.birth_order,
                emergency_contact=student.emergency_contact,
                father_name=father.fullname if father else None,
                father_age=father.age if father else None,
                father_occ=father.occupation if father else None,
                father_educ=father.educational_attainment if father else None,
                mother_name=mother.fullname if mother else None,
                mother_age=mother.age if mother else None,
                mother_occ=mother.occupation if mother else None,
                allow_parent_view_student_info=(
                    adviser.allow_parent_view_student_info if adviser else True
                ),
                allow_parent_view_eccd_pre=(
                    adviser.allow_parent_view_eccd_pre if adviser else False
                ),
                allow_parent_view_eccd_mid=(
                    adviser.allow_parent_view_eccd_mid if adviser else False
                ),
                allow_parent_view_eccd_post=(
                    adviser.allow_parent_view_eccd_post if adviser else False
                ),
                allow_parent_edit_student_info=(
                    adviser.allow_parent_edit_student_info if adviser else True
                ),
                allow_parent_edit_home_based_eccd=(
                    adviser.allow_parent_edit_home_based_eccd if adviser else False
                ),
                allow_parent_view=adviser.allow_parent_view if adviser else True,
                allow_parent_edit=adviser.allow_parent_edit if adviser else False,
                allow_parent_home_based_edit=(
                    adviser.allow_parent_home_based_edit if adviser else False
                ),
            )
        )

    return results


@router.post("/children/link")
def link_child_to_parent(
    payload: ParentLinkChildRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["user", "parent"])),
):
    student = (
        db.query(Student).filter(Student.lrn_number == payload.lrn_number).first()
    )
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student with this LRN not found.",
        )

    parent = db.query(Parent).filter(Parent.user_id == current_user.user_id).first()
    if not parent:
        parent = Parent(
            user_id=current_user.user_id,
            relationship_type=payload.relationship_type or "Guardian",
        )
        db.add(parent)
        db.commit()
        db.refresh(parent)

    # Legacy constraint: student LRN cannot be synced to multiple registered parent accounts
    existing_synced = (
        db.query(FamilyAccess)
        .join(Parent, FamilyAccess.parent_id == Parent.parent_id)
        .filter(
            FamilyAccess.student_lrn == payload.lrn_number,
            Parent.user_id.isnot(None),
        )
        .first()
    )
    if existing_synced and existing_synced.parent_id != parent.parent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This student LRN has already been synced to an account.",
        )

    # Check if already linked to this parent
    my_link = (
        db.query(FamilyAccess)
        .filter(
            FamilyAccess.student_lrn == payload.lrn_number,
            FamilyAccess.parent_id == parent.parent_id,
        )
        .first()
    )
    if my_link:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already linked to this student.",
        )

    new_link = FamilyAccess(
        parent_id=parent.parent_id,
        student_lrn=payload.lrn_number,
        relationship_type=payload.relationship_type or "Guardian",
    )
    db.add(new_link)
    db.commit()

    return {"message": "Successfully linked to student!"}


@router.put("/children/{lrn}")
def update_child_details(
    lrn: str,
    payload: ParentChildUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["user", "parent"])),
):
    parent = db.query(Parent).filter(Parent.user_id == current_user.user_id).first()
    if not parent:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Parent profile not found."
        )

    # Verify authorization: parent is linked to student
    link = (
        db.query(FamilyAccess)
        .filter(
            FamilyAccess.parent_id == parent.parent_id,
            FamilyAccess.student_lrn == lrn,
        )
        .first()
    )
    if not link:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to update this student.",
        )

    student = db.query(Student).filter(Student.lrn_number == lrn).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found."
        )

    # Check adviser permission: allow_parent_edit_student_info
    adviser = get_active_adviser_for_student(student, db)
    if adviser and not adviser.allow_parent_edit_student_info:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The Class Adviser has currently locked editing for student records.",
        )

    # Update editable student fields only
    if payload.emergency_contact is not None:
        student.emergency_contact = payload.emergency_contact
    if payload.address is not None:
        student.address = payload.address
    if payload.handedness is not None:
        student.handedness = payload.handedness
    if payload.num_of_siblings is not None:
        student.num_of_siblings = payload.num_of_siblings
    if payload.birth_order is not None:
        student.birth_order = payload.birth_order

    # Helper function to upsert father / mother in parents & family_access
    def upsert_parent_info(fullname, age, occupation, educ, rel_type):
        if not fullname or not fullname.strip():
            return

        fa = (
            db.query(FamilyAccess)
            .filter(
                FamilyAccess.student_lrn == lrn,
                FamilyAccess.relationship_type == rel_type,
            )
            .first()
        )
        if fa:
            p_rec = db.query(Parent).filter(Parent.parent_id == fa.parent_id).first()
            if p_rec:
                p_rec.fullname = fullname
                p_rec.age = age
                p_rec.occupation = occupation
                p_rec.educational_attainment = educ
        else:
            new_p = Parent(
                fullname=fullname,
                age=age,
                occupation=occupation,
                educational_attainment=educ,
                relationship_type=rel_type,
            )
            db.add(new_p)
            db.flush()
            new_fa = FamilyAccess(
                parent_id=new_p.parent_id,
                student_lrn=lrn,
                relationship_type=rel_type,
            )
            db.add(new_fa)

    upsert_parent_info(
        payload.father_name,
        payload.father_age,
        payload.father_occ,
        payload.father_educ,
        "Father",
    )
    upsert_parent_info(
        payload.mother_name,
        payload.mother_age,
        payload.mother_occ,
        payload.mother_educ,
        "Mother",
    )

    # Audit log
    audit_entry = SystemLog(
        user_id=current_user.user_id,
        action_type="Updated Student Info",
        details=f"Parent ({parent.fullname or current_user.username}) updated records for student LRN: {lrn}"[:255],
    )
    db.add(audit_entry)
    db.commit()

    return {"message": "Student details successfully updated!"}


@router.get("/children/{lrn}/eccd-summary", response_model=ParentEccdSummaryResponse)
def get_child_eccd_summary(
    lrn: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["user", "parent"])),
):
    parent = db.query(Parent).filter(Parent.user_id == current_user.user_id).first()
    if not parent:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Parent profile not found."
        )

    link = (
        db.query(FamilyAccess)
        .filter(
            FamilyAccess.parent_id == parent.parent_id,
            FamilyAccess.student_lrn == lrn,
        )
        .first()
    )
    if not link:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view this student.",
        )

    student = db.query(Student).filter(Student.lrn_number == lrn).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found."
        )

    adviser = get_active_adviser_for_student(student, db)
    can_view_pre = adviser.allow_parent_view_eccd_pre if adviser else False
    can_view_mid = adviser.allow_parent_view_eccd_mid if adviser else False
    can_view_post = adviser.allow_parent_view_eccd_post if adviser else False

    all_domains = db.query(EccdDomain).order_by(EccdDomain.domain_id).all()
    domain_code_map = {
        "Gross Motor": "GM",
        "Fine Motor": "FM",
        "Self-Help": "SH",
        "Receptive Language": "RL",
        "Expressive Language": "EL",
        "Cognitive": "C",
        "Socio-Emotional": "SE",
    }

    # Fetch all evaluations for this student
    evals = (
        db.query(StudentEccdEvaluation, EccdQuestion, EccdDomain)
        .join(EccdQuestion, StudentEccdEvaluation.question_id == EccdQuestion.question_id)
        .join(EccdDomain, EccdQuestion.domain_id == EccdDomain.domain_id)
        .filter(StudentEccdEvaluation.student_lrn == lrn)
        .all()
    )

    periods_data: Dict[str, Optional[PeriodSummary]] = {
        "PRE": None,
        "MID": None,
        "POST": None,
    }
    latest_phase = None

    for period in [TestingPeriod.PRE, TestingPeriod.MID, TestingPeriod.POST]:
        is_published = False
        if period == TestingPeriod.PRE:
            is_published = can_view_pre
        elif period == TestingPeriod.MID:
            is_published = can_view_mid
        elif period == TestingPeriod.POST:
            is_published = can_view_post

        period_evals = [e for e in evals if e[0].testing_period == period]
        if not period_evals:
            if not is_published:
                periods_data[period.value] = PeriodSummary(
                    testing_period=period.value,
                    is_published=False,
                    evaluation_date=None,
                    decimal_age=None,
                    domains=[
                        DomainScoreItem(
                            domain_code=domain_code_map.get(d.domain_name.replace(" Domain", "").strip(), "GM"),
                            domain_name=d.domain_name.replace(" Domain", "").strip(),
                            raw_score=None,
                            scaled_score=None,
                        )
                        for d in all_domains
                    ],
                    sum_of_scaled_scores=None,
                    standard_score=None,
                    interpretation="Pending Adviser Release",
                )
            continue

        # If period evaluation exists but teacher has not published this window to parents
        if not is_published:
            periods_data[period.value] = PeriodSummary(
                testing_period=period.value,
                is_published=False,
                evaluation_date=None,
                decimal_age=None,
                domains=[
                    DomainScoreItem(
                        domain_code=domain_code_map.get(d.domain_name.replace(" Domain", "").strip(), "GM"),
                        domain_name=d.domain_name.replace(" Domain", "").strip(),
                        raw_score=None,
                        scaled_score=None,
                    )
                    for d in all_domains
                ],
                sum_of_scaled_scores=None,
                standard_score=None,
                interpretation="Pending Adviser Release",
            )
            continue

        latest_phase = period.value

        # Calculate evaluation date from database records
        valid_dates = [e[0].evaluation_date for e in period_evals if e[0].evaluation_date]
        eval_date = max(valid_dates) if valid_dates else None

        # Decimal age at evaluation date
        dec_age = 4.0
        if student.date_of_birth and eval_date:
            dec_age = calculate_decimal_age(student.date_of_birth, eval_date)
        elif student.date_of_birth:
            dec_age = calculate_decimal_age(student.date_of_birth, date.today())

        formatted_evals = [
            {"domain_name": e[2].domain_name, "answer": e[0].answer.value}
            for e in period_evals
        ]

        try:
            scores_result = calculate_scores(formatted_evals, dec_age)
        except Exception:
            scores_result = {
                "raw_scores": {},
                "scaled_scores": {},
                "sum_of_scaled_scores": None,
                "standard_score": None,
                "interpretation": None,
            }

        domain_items: List[DomainScoreItem] = []
        raw_map = scores_result.get("raw_scores", {})
        scaled_map = scores_result.get("scaled_scores", {})

        for d in all_domains:
            clean_name = d.domain_name.replace(" Domain", "").strip()
            code = domain_code_map.get(clean_name, "GM")
            domain_items.append(
                DomainScoreItem(
                    domain_code=code,
                    domain_name=clean_name,
                    raw_score=raw_map.get(code),
                    scaled_score=scaled_map.get(code),
                )
            )

        periods_data[period.value] = PeriodSummary(
            testing_period=period.value,
            is_published=True,
            evaluation_date=eval_date,
            decimal_age=dec_age,
            domains=domain_items,
            sum_of_scaled_scores=scores_result.get("sum_of_scaled_scores"),
            standard_score=scores_result.get("standard_score"),
            interpretation=scores_result.get("interpretation"),
        )

    student_full_name = f"{student.first_name or ''} {student.last_name or ''}".strip()

    permissions_dict = {
        "allow_parent_view_student_info": adviser.allow_parent_view_student_info if adviser else True,
        "allow_parent_view_eccd_pre": can_view_pre,
        "allow_parent_view_eccd_mid": can_view_mid,
        "allow_parent_view_eccd_post": can_view_post,
        "allow_parent_edit_student_info": adviser.allow_parent_edit_student_info if adviser else True,
        "allow_parent_edit_home_based_eccd": adviser.allow_parent_edit_home_based_eccd if adviser else False,
    }

    return ParentEccdSummaryResponse(
        student_lrn=student.lrn_number,
        student_name=student_full_name,
        current_phase=latest_phase or "Not Started",
        periods=periods_data,
        permissions=permissions_dict,
    )

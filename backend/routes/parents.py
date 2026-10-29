from backend.schemas.student import ChildPublicResponse as ChildProfileResponse
from backend.schemas.student import EnrollmentResponse
from backend.schemas.common import MessageResult
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
    DomainScoreItem,
    ParentChildUpdateRequest,
    ParentEccdSummaryResponse,
    ParentLinkChildRequest,
    PeriodSummary,
)
from backend.utils.deps import verify_role
from backend.utils.eccd_scorer import calculate_decimal_age, calculate_scores
from backend.utils.eccd_dates import get_grading_date, get_official_testing_date

router = APIRouter(prefix="/api/parents", tags=["Parents"])


def get_active_adviser_for_student(student: Student, db: Session) -> Optional[Teacher]:
    from backend.utils.access import get_active_adviser_for_student as resolve_adviser
    return resolve_adviser(student, db)


@router.get("/children", response_model=List[ChildProfileResponse])
def get_parent_children(db: Session = Depends(get_db), current_user: User = Depends(verify_role(["user"]))):
    from backend.routes.students import linked_children
    return linked_children(db, current_user)


@router.post("/children/link", response_model=EnrollmentResponse)
def link_child_to_parent(payload: ParentLinkChildRequest, db: Session = Depends(get_db), current_user: User = Depends(verify_role(["user"]))):
    from backend.routes.students import link_child
    from backend.schemas.student import FamilyAccessCreate
    return link_child(FamilyAccessCreate(**payload.model_dump(exclude_unset=True)), db, current_user)


@router.put("/children/{lrn}", response_model=MessageResult)
def update_child_details(lrn: str, payload: ParentChildUpdateRequest, db: Session = Depends(get_db), current_user: User = Depends(verify_role(["user"]))):
    from backend.routes.students import update
    from backend.schemas.student import StudentUpdate
    return update(lrn, StudentUpdate.model_validate(payload.model_dump(exclude_unset=True)), db, current_user)


@router.get("/children/{lrn}/eccd-summary", response_model=ParentEccdSummaryResponse)
def get_child_eccd_summary(
    lrn: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["user", "parent"])),
):
    from backend.utils.access import authorize_student, resolve_student
    student = resolve_student(db, lrn)
    authorize_student(db, current_user, student)
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
        "Socio-Emotional": "SE", "Social-Emotional": "SE",
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

        records = [evaluation for evaluation, _, _ in evals]
        eval_date = get_official_testing_date(records, period)
        grading_date = get_grading_date(records, period)
        dec_age = calculate_decimal_age(student.date_of_birth, grading_date) if student.date_of_birth and grading_date else None

        formatted_evals = [
            {"domain_name": e[2].domain_name, "answer": e[0].answer.value}
            for e in period_evals
        ]

        try:
            scores_result = calculate_scores(formatted_evals, dec_age) if dec_age is not None else {}
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
        "allow_parent_view_student_info": bool(adviser and adviser.allow_parent_view_student_info),
        "allow_parent_view_eccd_pre": can_view_pre,
        "allow_parent_view_eccd_mid": can_view_mid,
        "allow_parent_view_eccd_post": can_view_post,
        "allow_parent_edit_student_info": adviser.allow_parent_edit_student_info if adviser else False,
        "allow_parent_edit_home_based_eccd": adviser.allow_parent_edit_home_based_eccd if adviser else False,
    }

    return ParentEccdSummaryResponse(
        student_lrn=student.masked_lrn,
        student_id=student.student_id,
        student_name=student_full_name if permissions_dict["allow_parent_view_student_info"] else "",
        current_phase=latest_phase or "Not Started",
        periods=periods_data,
        permissions=permissions_dict,
    )

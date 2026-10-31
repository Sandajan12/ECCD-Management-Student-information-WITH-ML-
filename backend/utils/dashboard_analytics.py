"""Staff dashboard metrics over current classroom assessment records."""
from collections import defaultdict

from sqlalchemy import case, func
from sqlalchemy.orm import Session
from sqlalchemy.sql import ColumnElement, Subquery

from backend.models import EccdDomain, EccdQuestion, Section, Student, StudentEccdEvaluation
from backend.models.eccd import EccdAnswer, TestingPeriod
from backend.models.student import Gender
from backend.schemas.analytics import CriticalDomainSummary, DelaySummary
from backend.utils.eccd_dates import get_official_testing_date
from backend.utils.eccd_scorer import calculate_decimal_age, calculate_scores


def period_rank() -> ColumnElement[int]:
    return case(
        (StudentEccdEvaluation.testing_period == TestingPeriod.POST, 3),
        (StudentEccdEvaluation.testing_period == TestingPeriod.MID, 2),
        (StudentEccdEvaluation.testing_period == TestingPeriod.PRE, 1),
        else_=0,
    )


def latest_completed_periods(db: Session, student_scope: list[ColumnElement[bool]]) -> Subquery:
    """Select one complete, teacher-dated period per student: POST > MID > PRE.

    Completion follows the PRE mastery rule: every configured question needs
    a saved answer with an official teacher date, including home-based items.
    """
    required = db.query(func.count(EccdQuestion.question_id)).scalar_subquery()
    completed = (
        db.query(StudentEccdEvaluation.student_id, period_rank().label("period_rank"))
        .join(Student, Student.student_id == StudentEccdEvaluation.student_id)
        .join(EccdQuestion, EccdQuestion.question_id == StudentEccdEvaluation.question_id)
        .filter(*student_scope)
        .group_by(StudentEccdEvaluation.student_id, StudentEccdEvaluation.testing_period)
        .having(
            func.count() == required,
            func.count(StudentEccdEvaluation.teacher_evaluation_date) == required,
        )
        .subquery()
    )
    return (
        db.query(completed.c.student_id, func.max(completed.c.period_rank).label("period_rank"))
        .group_by(completed.c.student_id)
        .subquery()
    )


def critical_domain(db: Session, student_scope: list[ColumnElement[bool]]) -> CriticalDomainSummary:
    latest = latest_completed_periods(db, student_scope)
    completed_students = db.query(func.count()).select_from(latest).scalar()
    top = (
        db.query(EccdDomain.domain_name, func.count().label("total"))
        .select_from(StudentEccdEvaluation)
        .join(latest, (latest.c.student_id == StudentEccdEvaluation.student_id)
              & (latest.c.period_rank == period_rank()))
        .join(EccdQuestion, EccdQuestion.question_id == StudentEccdEvaluation.question_id)
        .join(EccdDomain, EccdDomain.domain_id == EccdQuestion.domain_id)
        .filter(StudentEccdEvaluation.answer == EccdAnswer.DI_KAYA)
        .group_by(EccdDomain.domain_id, EccdDomain.domain_name)
        .order_by(func.count().desc(), EccdDomain.domain_name, EccdDomain.domain_id)
        .first()
    )
    return CriticalDomainSummary(
        domainName=top.domain_name.replace(" Domain", "").strip() if top else None,
        totalDiKaya=top.total if top else 0,
        completedStudents=completed_students,
    )


def delay_summary(db: Session, student_scope: list[ColumnElement[bool]], section: str) -> DelaySummary:
    latest = latest_completed_periods(db, student_scope)
    sections = db.query(Section.section_name).order_by(Section.section_name)
    if section != "All":
        sections = sections.filter(Section.section_name == section)
    result = DelaySummary(bySection={name: 0 for (name,) in sections})
    rows = (
        db.query(Student.student_id, Student.date_of_birth, Student.gender, Section.section_name,
                 StudentEccdEvaluation.testing_period, StudentEccdEvaluation.teacher_evaluation_date,
                 StudentEccdEvaluation.answer, EccdQuestion.domain_id)
        .select_from(StudentEccdEvaluation)
        .join(latest, (latest.c.student_id == StudentEccdEvaluation.student_id)
              & (latest.c.period_rank == period_rank()))
        .join(Student, Student.student_id == StudentEccdEvaluation.student_id)
        .outerjoin(Section, Section.section_id == Student.section_id)
        .join(EccdQuestion, EccdQuestion.question_id == StudentEccdEvaluation.question_id)
        .all()
    )
    assessments = defaultdict(list)
    for student_id, birth_date, gender, name, period, when, answer, domain_id in rows:
        assessments[(student_id, birth_date, gender, name)].append({
            "domain_id": domain_id, "answer": answer.value,
            "testing_period": period, "teacher_evaluation_date": when,
        })
    for (_, birth_date, gender, name), records in assessments.items():
        when = get_official_testing_date(records, records[0]["testing_period"])
        if birth_date is None or when is None:
            continue
        age = calculate_decimal_age(birth_date, when)
        scores = calculate_scores(records, age)
        if scores["interpretation"] is None:
            continue
        result.assessedStudents += 1
        # The official table names the significant-delay band "Delay".
        if scores["interpretation"] not in {"Slight Delay", "Delay"}:
            continue
        result.totalDelayed += 1
        result.male += int(gender == Gender.MALE)
        result.female += int(gender == Gender.FEMALE)
        name = name or "Unassigned"
        result.bySection[name] = result.bySection.get(name, 0) + 1
    result.bySection = dict(sorted(result.bySection.items()))
    return result

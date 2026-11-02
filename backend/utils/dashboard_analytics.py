"""Staff dashboard metrics over current classroom assessment records."""
from collections import defaultdict

from sqlalchemy import case, func
from sqlalchemy.orm import Session
from sqlalchemy.sql import ColumnElement, Subquery

from backend.models import EccdDomain, EccdQuestion, Section, Student, StudentEccdEvaluation
from backend.models.eccd import EccdAnswer, TestingPeriod
from backend.models.student import Gender
from backend.schemas.analytics import CriticalDomainSummary, DelayedStudentSummary, DelaySummary, DevelopmentalInterpretation, ExcellingDomainSummary, SectionGenderCounts
from backend.schemas.analytics import PriorityStudentSummary, TeacherDomainSummary, TeacherPeriodInsights
from backend.utils.eccd_dates import get_official_testing_date
from backend.utils.eccd_scorer import calculate_decimal_age, calculate_scores

INTERPRETATION_LABELS: dict[DevelopmentalInterpretation, frozenset[str]] = {
    "Delay": frozenset({"Delay"}),
    "Average": frozenset({"Average"}),
    "Slight Advance": frozenset({"Slight Advance", "Slight Advanced"}),
    "Highly Advance": frozenset({"Highly Advance", "Highly Advanced"}),
    "Slight Advancement": frozenset({"Slight Advance", "Slight Advanced"}),
    "Highly Advancement": frozenset({"Highly Advance", "Highly Advanced"}),
    "Average Development": frozenset({"Average"}),
    "Slight Delay": frozenset({"Slight Delay"}),
    "Significant Delay": frozenset({"Delay"}),
    "Delayed / Needs Support": frozenset({"Slight Delay", "Delay"}),
    # Same official labels and compatibility aliases used by the summary export.
    "Advanced Development": frozenset({"Slight Advance", "Slight Advanced", "Highly Advance", "Highly Advanced"}),
}


def period_rank() -> ColumnElement[int]:
    return case(
        (StudentEccdEvaluation.testing_period == TestingPeriod.POST, 3),
        (StudentEccdEvaluation.testing_period == TestingPeriod.MID, 2),
        (StudentEccdEvaluation.testing_period == TestingPeriod.PRE, 1),
        else_=0,
    )


def latest_completed_periods(db: Session, student_scope: list[ColumnElement[bool]],
                             testing_period: TestingPeriod | None = None) -> Subquery:
    """Select one complete, teacher-dated period per student: POST > MID > PRE.

    Completion follows the PRE mastery rule: every configured question needs
    a saved answer with an official teacher date, including home-based items.
    """
    required = db.query(func.count(EccdQuestion.question_id)).scalar_subquery()
    completed = (
        db.query(StudentEccdEvaluation.student_id, period_rank().label("period_rank"))
        .join(Student, Student.student_id == StudentEccdEvaluation.student_id)
        .join(EccdQuestion, EccdQuestion.question_id == StudentEccdEvaluation.question_id)
        .filter(*student_scope, *([StudentEccdEvaluation.testing_period == testing_period] if testing_period else []))
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


def excelling_domain(db: Session, student_scope: list[ColumnElement[bool]],
                     testing_period: TestingPeriod | None = None) -> ExcellingDomainSummary:
    """Rank domains by item mastery in the chosen or latest complete period."""
    latest = latest_completed_periods(db, student_scope, testing_period)
    completed_students = db.query(func.count()).select_from(latest).scalar()
    kaya = func.sum(case((StudentEccdEvaluation.answer == EccdAnswer.KAYA, 1), else_=0))
    total = func.count()
    top = (
        db.query(EccdDomain.domain_name, kaya.label("kaya"), total.label("total"))
        .select_from(StudentEccdEvaluation)
        .join(latest, (latest.c.student_id == StudentEccdEvaluation.student_id)
              & (latest.c.period_rank == period_rank()))
        .join(EccdQuestion, EccdQuestion.question_id == StudentEccdEvaluation.question_id)
        .join(EccdDomain, EccdDomain.domain_id == EccdQuestion.domain_id)
        .group_by(EccdDomain.domain_id, EccdDomain.domain_name)
        .order_by((kaya * 1.0 / total).desc(), EccdDomain.domain_name, EccdDomain.domain_id)
        .first()
    )
    return ExcellingDomainSummary(
        domainName=top.domain_name.replace(" Domain", "").strip() if top else None,
        masteryRate=round(top.kaya * 100 / top.total, 2) if top else None,
        totalKaya=top.kaya if top else 0,
        totalItems=top.total if top else 0,
        completedStudents=completed_students,
    )


def teacher_period_insights(db: Session, student_scope: list[ColumnElement[bool]],
                            testing_period: TestingPeriod) -> TeacherPeriodInsights:
    """Summarize saved checklist items in one authorized, active classroom.

    Item counts follow the existing dashboard pie/eccd assessment queries.
    Student completion separately requires every configured question and an
    official teacher date, as in latest_completed_periods. No period fallback.
    """
    scope = [*student_scope, Student.is_active.is_(True)]
    total_students = db.query(Student).filter(*scope).count()
    completed = latest_completed_periods(db, scope, testing_period)
    completed_students = db.query(func.count()).select_from(completed).scalar()
    kaya = func.sum(case((StudentEccdEvaluation.answer == EccdAnswer.KAYA, 1), else_=0))
    query = (
        db.query(StudentEccdEvaluation)
        .join(Student, Student.student_id == StudentEccdEvaluation.student_id)
        .join(EccdQuestion, EccdQuestion.question_id == StudentEccdEvaluation.question_id)
        .filter(*scope, StudentEccdEvaluation.testing_period == testing_period)
    )
    rows = (
        query.with_entities(EccdDomain.domain_id, EccdDomain.domain_name,
                            kaya.label("kaya"), func.count().label("total"))
        .join(EccdDomain, EccdDomain.domain_id == EccdQuestion.domain_id)
        .group_by(EccdDomain.domain_id, EccdDomain.domain_name)
        .order_by(EccdDomain.domain_name, EccdDomain.domain_id)
        .all()
    )
    domains = [TeacherDomainSummary(
        domainId=row.domain_id,
        domainName=row.domain_name,
        totalKaya=row.kaya,
        totalDiKaya=row.total - row.kaya,
        totalItems=row.total,
        masteryRate=round(row.kaya * 100 / row.total, 2),
    ) for row in rows]
    excellence = sorted(domains, key=lambda d: (-d.totalKaya / d.totalItems, d.domainName.casefold(), d.domainId))
    critical = sorted((d for d in domains if d.totalDiKaya),
                      key=lambda d: (-d.totalDiKaya, d.domainName.casefold(), d.domainId))
    priority = (
        query.with_entities(Student.student_id, Student.first_name, Student.middle_name,
                            Student.last_name, func.count().label("total"))
        .filter(StudentEccdEvaluation.answer == EccdAnswer.DI_KAYA)
        .group_by(Student.student_id, Student.first_name, Student.middle_name, Student.last_name)
        .order_by(func.count().desc(), func.lower(func.coalesce(Student.last_name, "")),
                  func.lower(func.coalesce(Student.first_name, "")), Student.student_id)
        .first()
    )
    return TeacherPeriodInsights(
        period=testing_period.value,
        totalStudents=total_students,
        completedStudents=completed_students,
        completionRate=round(completed_students * 100 / total_students, 2) if total_students else 0,
        domains=domains,
        excellingDomain=excellence[0] if excellence else None,
        criticalDomain=critical[0] if critical else None,
        priorityStudent=PriorityStudentSummary(
            studentId=priority.student_id,
            studentName=" ".join(part.strip() for part in (priority.first_name, priority.middle_name, priority.last_name)
                                 if part and part.strip()) or f"Student {priority.student_id}",
            totalDiKaya=priority.total,
        ) if priority else None,
    )


def delay_summary(db: Session, student_scope: list[ColumnElement[bool]], section: str,
                  section_id: int | None = None,
                  testing_period: TestingPeriod | None = None,
                  interpretation: DevelopmentalInterpretation | None = None) -> DelaySummary:
    """Score a chosen period as in the summary export, or the latest complete one."""
    sections = db.query(Section.section_name).order_by(Section.section_name)
    if section_id is not None:
        sections = sections.filter(Section.section_id == section_id)
    elif section != "All":
        sections = sections.filter(Section.section_name == section)
    result = DelaySummary(bySection={name: SectionGenderCounts() for (name,) in sections})
    query = (
        db.query(Student.student_id, Student.date_of_birth, Student.gender, Section.section_name,
                 StudentEccdEvaluation.testing_period, StudentEccdEvaluation.teacher_evaluation_date,
                 StudentEccdEvaluation.answer, EccdQuestion.domain_id,
                 Student.first_name, Student.middle_name, Student.last_name)
        .select_from(StudentEccdEvaluation)
        .join(Student, Student.student_id == StudentEccdEvaluation.student_id)
        .outerjoin(Section, Section.section_id == Student.section_id)
        .join(EccdQuestion, EccdQuestion.question_id == StudentEccdEvaluation.question_id)
    )
    if testing_period is None:
        latest = latest_completed_periods(db, student_scope)
        query = query.join(latest, (latest.c.student_id == StudentEccdEvaluation.student_id)
                           & (latest.c.period_rank == period_rank()))
    else:
        # The export scores recorded answers for this period at its official date;
        # it does not require every configured question to have been recorded.
        query = query.filter(*student_scope, StudentEccdEvaluation.testing_period == testing_period)
    rows = query.all()
    assessments = defaultdict(list)
    matching_labels = INTERPRETATION_LABELS[interpretation] if interpretation else {"Slight Delay", "Delay"}
    for student_id, birth_date, gender, name, period, when, answer, domain_id, first, middle, last in rows:
        student_name = " ".join(part.strip() for part in (first, middle, last) if part and part.strip())
        assessments[(student_id, birth_date, gender, name, student_name)].append({
            "domain_id": domain_id, "answer": answer.value,
            "testing_period": period, "teacher_evaluation_date": when,
        })
    for (student_id, birth_date, gender, name, student_name), records in assessments.items():
        when = get_official_testing_date(records, records[0]["testing_period"])
        if birth_date is None or when is None:
            continue
        age = calculate_decimal_age(birth_date, when)
        scores = calculate_scores(records, age)
        if scores["interpretation"] is None:
            continue
        result.assessedStudents += 1
        # Omitted interpretation preserves the existing delay-only API behavior.
        if scores["interpretation"] not in matching_labels:
            continue
        result.totalMatched += 1
        result.totalDelayed += int(scores["interpretation"] in {"Slight Delay", "Delay"})
        male = int(gender == Gender.MALE)
        female = int(gender == Gender.FEMALE)
        result.male += male
        result.female += female
        name = name or "Unassigned"
        section_counts = result.bySection.setdefault(name, SectionGenderCounts())
        section_counts.male += male
        section_counts.female += female
        if section_id is not None or section != "All":
            result.students.append(DelayedStudentSummary(
                studentId=student_id,
                studentName=student_name or f"Student {student_id}",
                decimalAge=age,
                delayStatus=scores["interpretation"],
            ))
    result.bySection = dict(sorted(result.bySection.items()))
    result.students.sort(key=lambda student: (student.studentName.casefold(), student.studentId))
    return result

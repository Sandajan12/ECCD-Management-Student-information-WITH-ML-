from datetime import date
from fastapi import HTTPException
from sqlalchemy.orm import Session
from backend.models import EccdDomain, EccdQuestion, Student, StudentEccdEvaluation, User
from backend.models.eccd import EccdAnswer, TestingPeriod
from backend.schemas.common import ParentPermissions
from backend.schemas.eccd import EvaluationBatch, ParentEvaluationBatch
from backend.utils.access import authorize_student, current_teacher, get_active_adviser_for_student, permissions_for_student, resolve_student
from backend.utils.eccd_scorer import calculate_decimal_age, calculate_scores
from backend.utils.students import public_student

PERIODS = (TestingPeriod.PRE, TestingPeriod.MID, TestingPeriod.POST)
DOMAIN_CODES = {1: "GM", 2: "FM", 3: "SH", 4: "RL", 5: "EL", 6: "C", 7: "SE"}


def released(permissions: ParentPermissions, period: TestingPeriod) -> bool:
    return bool(getattr(permissions, f"allow_parent_view_eccd_{period.value.lower()}"))


def save_evaluation(db: Session, user: User, payload: EvaluationBatch) -> dict:
    student = resolve_student(db, payload.student_lrn)
    authorize_student(db, user, student)
    db.query(Student).filter_by(student_id=student.student_id).with_for_update().one()
    question_ids = [row.question_id for row in payload.evaluations]
    actual_ids = {row[0] for row in db.query(EccdQuestion.question_id).filter(EccdQuestion.question_id.in_(question_ids))}
    if actual_ids != set(question_ids):
        raise HTTPException(400, "Unknown assessment question.")
    existing = db.query(StudentEccdEvaluation).filter_by(student_id=student.student_id).all()
    for record in existing:
        if record.testing_period == payload.testing_period:
            continue
        previous = PERIODS.index(record.testing_period) < PERIODS.index(payload.testing_period)
        if (previous and record.evaluation_date >= payload.assessment_date) or (not previous and record.evaluation_date <= payload.assessment_date):
            raise HTTPException(400, "Assessment dates must follow PRE < MID < POST.")
    teacher = current_teacher(db, user) if user.role.value == "admin" else get_active_adviser_for_student(student, db)
    for record in existing:
        if record.testing_period == payload.testing_period:
            record.evaluation_date = payload.assessment_date
    by_question = {record.question_id: record for record in existing if record.testing_period == payload.testing_period}
    for answer in payload.evaluations:
        record = by_question.get(answer.question_id)
        if record is None:
            record = StudentEccdEvaluation(student_id=student.student_id, teacher_id=teacher.teacher_id if teacher else None, question_id=answer.question_id, testing_period=payload.testing_period, evaluation_date=payload.assessment_date)
            db.add(record)
        record.answer = answer.answer
    db.commit()
    return {"message": "Assessment and evaluation date saved successfully!", "period": payload.testing_period, "evaluation_date": payload.assessment_date, "student_id": student.student_id}


def save_home_evaluation(db: Session, user: User, payload: ParentEvaluationBatch) -> dict:
    student = resolve_student(db, payload.student_lrn)
    authorize_student(db, user, student)
    permissions = permissions_for_student(db, student)
    if not permissions.allow_parent_edit_home_based_eccd:
        raise HTTPException(403, "Editing is currently locked by the Class Adviser.")
    db.query(Student).filter_by(student_id=student.student_id).with_for_update().one()
    teacher = get_active_adviser_for_student(student, db)
    ids = [row.question_id for row in payload.evaluations]
    allowed = {row[0] for row in db.query(EccdQuestion.question_id).filter(EccdQuestion.question_id.in_(ids), EccdQuestion.is_home_based.is_(True))}
    if set(ids) != allowed:
        raise HTTPException(400, "Unknown or non-home-based assessment question.")
    for answer in payload.evaluations:
        record = db.query(StudentEccdEvaluation).filter_by(student_id=student.student_id, question_id=answer.question_id, testing_period=answer.testing_period).first()
        if record:
            if record.answer != answer.answer:
                record.answer, record.evaluation_date = answer.answer, date.today()
        else:
            db.add(StudentEccdEvaluation(student_id=student.student_id, teacher_id=teacher.teacher_id, question_id=answer.question_id, testing_period=answer.testing_period, answer=answer.answer, evaluation_date=date.today()))
    db.commit()
    return {"message": "Assessment saved successfully!"}


def assessment_data(db: Session, user: User, identifier: str, parent_view: bool = False) -> dict:
    student = resolve_student(db, identifier)
    authorize_student(db, user, student)
    permissions = permissions_for_student(db, student)
    domains = db.query(EccdDomain).order_by(EccdDomain.domain_id).all()
    questions = db.query(EccdQuestion).order_by(EccdQuestion.sequence_order, EccdQuestion.question_id).all()
    evaluations = db.query(StudentEccdEvaluation).filter_by(student_id=student.student_id).order_by(StudentEccdEvaluation.evaluation_id).all()
    visible = {period: not parent_view or released(permissions, period) for period in PERIODS}
    dates, summaries, ages = {}, {}, {}
    for period in PERIODS:
        records = [record for record in evaluations if record.testing_period == period]
        dates[period] = max((record.evaluation_date for record in records), default=None) if visible[period] else None
        age = calculate_decimal_age(student.date_of_birth, dates[period]) if student.date_of_birth and dates[period] else None
        scores = calculate_scores([{"domain_id": record.question.domain_id, "answer": record.answer.value} for record in records], age) if age is not None else None
        summaries[period] = {"period": period, "isReleased": visible[period], "is_published": visible[period], "isEvaluated": bool(records) if visible[period] else False,
                             "assessmentDate": dates[period], "decimalAge": age, "standardScore": scores["standard_score"] if scores else None,
                             "interpretation": "Pending Adviser Release" if not visible[period] else (scores["interpretation"] if scores else None),
                             "rawScores": scores["raw_scores"] if scores else None, "scaledScores": scores["scaled_scores"] if scores else None, "sumOfScaledScores": scores["sum_of_scaled_scores"] if scores else None}
    formatted, checklist = [], []
    for domain in domains:
        domain_questions = [question for question in questions if question.domain_id == domain.domain_id and (not parent_view or question.is_home_based)]
        rows = []
        ages[str(domain.domain_id)] = {}
        for period in PERIODS:
            domain_records = [record for record in evaluations if record.question.domain_id == domain.domain_id and record.testing_period == period]
            first = domain_records[0] if domain_records and visible[period] else None
            ages[str(domain.domain_id)][period] = summaries[period]["decimalAge"] if parent_view else (calculate_decimal_age(student.date_of_birth, first.evaluation_date) if student.date_of_birth and first else None)
        for question in domain_questions:
            answers = {period: next((record.answer for record in evaluations if record.question_id == question.question_id and record.testing_period == period), None) if visible[period] else None for period in PERIODS}
            rows.append({"question_id": question.question_id, "domain_id": question.domain_id, "domain_name": domain.domain_name.replace(" Domain", ""), "question_text": question.question_text, "sequence_order": question.sequence_order, "answers": answers})
        if rows or not parent_view:
            formatted.append({"domain_id": domain.domain_id, "domain_name": domain.domain_name, "questions": rows})
        checklist.extend(rows)
    result = {"student_id": student.student_id, "masked_lrn": student.masked_lrn, "student_birth_date": student.date_of_birth if not parent_view or permissions.allow_parent_view_student_info else None,
              "domains": formatted, "evalAges": ages, "periodDates": dates, "evaluationDates": dates}
    if parent_view:
        public = public_student(db, student)
        if not permissions.allow_parent_view_student_info:
            for key in ("first_name", "middle_name", "last_name", "date_of_birth", "gender", "address", "emergency_contact", "decimal_age", "handedness", "num_of_siblings", "birth_order", "parent_names"):
                public[key] = None
            public["profile_completeness"] = 0
            public["full_name"], public["parents"] = None, []
        matrix = [{"domain_id": domain.domain_id, "domain_name": domain.domain_name, "domain_code": DOMAIN_CODES.get(domain.domain_id, ""),
                   "scores": {period: summaries[period]["scaledScores"].get(DOMAIN_CODES.get(domain.domain_id)) if summaries[period]["scaledScores"] else None for period in PERIODS}} for domain in domains]
        result.update(student=public, permissions=permissions.model_dump(), summary=summaries, matrix=matrix, homeBasedChecklist=checklist, can_edit_home_based=permissions.allow_parent_edit_home_based_eccd)
    return result


def parent_dashboard(db: Session, user: User, identifier: str) -> dict:
    student = resolve_student(db, identifier)
    authorize_student(db, user, student)
    records = db.query(StudentEccdEvaluation).filter_by(student_id=student.student_id).all()
    latest = next((period for period in reversed(PERIODS) if any(record.testing_period == period for record in records)), None)
    reference_domains = db.query(EccdDomain).order_by(EccdDomain.domain_id).all()
    cards = [{"domain_id": domain.domain_id, "domain_name": domain.domain_name.replace(" Domain", "").strip(),
              "scoreText": "Not evaluated yet", "progress": 0, "statusText": "Pending", "statusColor": "warning",
              "isExcelling": False, "needsSupport": False} for domain in reference_domains]
    result = {"currentPhase": "Not Started", "latestPhase": None, "excelsIn": "No Data", "needsSupportIn": "No Data", "assessmentMastered": False, "totalKaya": 0, "totalDiKaya": 0, "is_published": False,
              "overallStatus": "Assessment Pending", "overallStatusColor": "default", "domainCards": cards}
    if latest is None and any(released(permissions_for_student(db, student), period) for period in PERIODS):
        return result
    if latest is None or not released(permissions_for_student(db, student), latest):
        for card in cards:
            card.update(progress=None, scoreText="Pending Adviser Release", statusText="Pending Adviser Release")
        return {**result, "currentPhase": "Pending Adviser Release", "excelsIn": "Pending Adviser Release", "needsSupportIn": "Pending Adviser Release", "totalKaya": None, "totalDiKaya": None, "interpretation": "Pending Adviser Release", "overallStatus": "Pending Adviser Release"}
    records = [record for record in records if record.testing_period == latest]
    domains = {}
    for record in records:
        name = record.question.domain.domain_name.replace(" Domain", "").strip()
        kaya, total = domains.get(name, (0, 0))
        domains[name] = (kaya + int(record.answer == EccdAnswer.KAYA), total + 1)
    ratios = {name: kaya / total for name, (kaya, total) in domains.items()}
    passed = sum(kaya for kaya, total in domains.values())
    failed = len(records) - passed
    mastered = latest == TestingPeriod.POST and failed == 0 and bool(records)
    for card in cards:
        kaya, total = domains.get(card["domain_name"], (0, 0))
        percentage = int(kaya * 100 / total + 0.5) if total else 0
        status, color = ("Not Evaluated", "warning") if not total else ("Excelling", "success") if percentage >= 80 else ("Developing", "info") if percentage >= 50 else ("Needs Support", "error")
        card.update(scoreText=f"{kaya} of {total} Skills Mastered" if total else "Not evaluated yet", progress=percentage,
                    statusText=status, statusColor=color, isExcelling=bool(total and percentage >= 80), needsSupport=bool(total and percentage < 50))
    overall_percentage = int(passed * 100 / len(records) + 0.5)
    return {"currentPhase": {TestingPeriod.PRE: "Pre-Test", TestingPeriod.MID: "Mid-Test", TestingPeriod.POST: "Post-Test"}[latest], "latestPhase": latest.value,
            "excelsIn": min(ratios, key=lambda name: (-ratios[name], name)), "needsSupportIn": "All Skills Mastered" if mastered else ("None (All Passed)" if failed == 0 else min(ratios, key=lambda name: (ratios[name], name))),
            "assessmentMastered": mastered, "totalKaya": passed, "totalDiKaya": failed, "is_published": True,
            "overallStatus": "Needs Attention" if overall_percentage < 50 else "Developing Well",
            "overallStatusColor": "warning" if overall_percentage < 50 else "success", "domainCards": cards}

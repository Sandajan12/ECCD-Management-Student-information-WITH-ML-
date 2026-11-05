import math
from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.models.eccd import (
    EccdDomain,
    EccdQuestion,
    StudentEccdEvaluation,
    TestingPeriod,
)
from backend.models.student import Student
from backend.models.teacher import Teacher
from backend.models.section import Section
from backend.models.section_teacher import SectionTeacher
from backend.schemas.eccd import (
    DomainProgress,
    EccdCardPreviewResponse,
    EccdExportYearQuery,
    EccdSectionExportQuery,
    EccdStudentExportQuery,
    EvaluationBatch,
    EvaluationPublicResponse,
    EvaluationSaved,
    ParentAssessmentResponse,
    ParentDashboardResponse,
    ParentEvaluationBatch,
    ParentEvaluationSaved,
    TeacherAssessmentResponse,
)
from backend.schemas.operations import DomainProgressResult, ParentProgressPeriod, SectionSummaryItem
from backend.schemas.student import StudentPublicResponse
from backend.schemas.common import PositiveId
from backend.utils.deps import verify_role
from backend.utils.eccd_scorer import calculate_decimal_age, calculate_scores
from backend.utils.eccd_dates import get_grading_date, get_official_testing_date

router = APIRouter(prefix="/api/eccd", tags=["ECCD"])


@router.get("/card-preview/{student_id}", response_model=EccdCardPreviewResponse)
def preview_eccd_card(
    response: Response,
    student_id: int = Path(gt=0),
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["admin", "super-admin"])),
):
    from backend.utils.access import authorize_student, resolve_student
    from backend.utils.excel import student_workbook
    from backend.utils.workbook_preview import worksheet_preview

    student = resolve_student(db, student_id)
    authorize_student(db, current_user, student)
    workbook = student_workbook(db, student)
    try:
        html = worksheet_preview(workbook["CHECKLIST"])
    finally:
        workbook.close()
    response.headers["Cache-Control"] = "no-store"
    return EccdCardPreviewResponse(student_id=student.student_id, html=html)


@router.get("/students", response_model=list[StudentPublicResponse])
def get_teacher_students(db: Session = Depends(get_db), current_user=Depends(verify_role(["admin", "super-admin"]))):
    from backend.utils.access import teacher_sections
    from backend.utils.students import public_students, student_profile_options
    teacher = db.query(Teacher).filter_by(user_id=current_user.user_id).first()
    if teacher is None:
        return []
    students = db.query(Student).options(*student_profile_options()).filter(Student.section_id.in_(teacher_sections(db, teacher)), Student.is_active.is_(True)).order_by(Student.last_name, Student.first_name, Student.student_id).all()
    return public_students(db, students)


@router.get("/domains-progress", response_model=list[DomainProgressResult])
def get_domains_progress(
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["admin", "teacher", "super-admin"])),
):
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
    if not teacher:
        raise HTTPException(status_code=403, detail="Teacher not found.")
        
    students = (
        db.query(Student)
        .join(Section, Student.section_id == Section.section_id)
        .join(SectionTeacher, Section.section_id == SectionTeacher.section_id)
        .filter(
            SectionTeacher.teacher_id == teacher.teacher_id,
            SectionTeacher.status == "Active",
            SectionTeacher.role == "Primary Adviser",
            Student.is_active == True,
        )
        .all()
    )
    
    student_ids = [s.student_id for s in students]
    total_students = len(student_ids)
    
    domains = db.query(EccdDomain).all()
    questions = db.query(EccdQuestion).order_by(EccdQuestion.sequence_order).all()
    questions_by_domain: dict[int, list[EccdQuestion]] = defaultdict(list)
    for question in questions:
        questions_by_domain[question.domain_id].append(question)
    
    if total_students > 0:
        evaluations = (
            db.connection().execute(
                select(
                    StudentEccdEvaluation.student_id,
                    StudentEccdEvaluation.testing_period,
                    StudentEccdEvaluation.question_id,
                ).where(StudentEccdEvaluation.student_id.in_(student_ids))
            )
            .all()
        )
    else:
        evaluations = []

    # A saved answer completes a question regardless of answer or evaluator role.
    student_period_answers: dict[tuple[int, TestingPeriod], set[int]] = defaultdict(set)
    for student_id, period, question_id in evaluations:
        student_period_answers[(student_id, period)].add(question_id)

    formatted_domains = []
    
    for domain in domains:
        domain_questions = questions_by_domain.get(domain.domain_id, [])
        required_question_ids = {q.question_id for q in domain_questions}
        completed_counts = {period: 0 for period in TestingPeriod}

        if required_question_ids and total_students > 0:
            for student_id in student_ids:
                for period in TestingPeriod:
                    answered_questions = student_period_answers.get((student_id, period))
                    if answered_questions is not None and required_question_ids.issubset(answered_questions):
                        completed_counts[period] += 1

        pre_progress = math.floor((completed_counts[TestingPeriod.PRE] / total_students) * 100 + 0.5) if total_students > 0 else 0
        mid_progress = math.floor((completed_counts[TestingPeriod.MID] / total_students) * 100 + 0.5) if total_students > 0 else 0
        post_progress = math.floor((completed_counts[TestingPeriod.POST] / total_students) * 100 + 0.5) if total_students > 0 else 0
        
        formatted_domains.append({
            "domain_id": domain.domain_id,
            "domain_name": domain.domain_name,
            "questions": [
                {
                    "question_id": q.question_id,
                    "domain_id": q.domain_id,
                    "question_text": q.question_text,
                    "sequence_order": q.sequence_order,
                    "is_home_based": q.is_home_based,
                } for q in domain_questions
            ],
            "pre_progress": pre_progress,
            "mid_progress": mid_progress,
            "post_progress": post_progress
        })
        
    return formatted_domains


@router.get("/assessment/{lrn}", response_model=TeacherAssessmentResponse)
def get_assessment_data(lrn: str, db: Session = Depends(get_db), current_user=Depends(verify_role(["admin", "super-admin"]))):
    from backend.utils.assessments import assessment_data
    return assessment_data(db, current_user, lrn)





@router.get("/parent/assessment/{student_lrn}", response_model=ParentAssessmentResponse)
def get_parent_assessment_data(student_lrn: str, db: Session = Depends(get_db), current_user=Depends(verify_role(["user", "super-admin"]))):
    from backend.utils.assessments import assessment_data
    return assessment_data(db, current_user, student_lrn, parent_view=True)


@router.post("/parent/evaluate", response_model=ParentEvaluationSaved)
def evaluate_student_parent(payload: ParentEvaluationBatch, db: Session = Depends(get_db), current_user=Depends(verify_role(["user", "super-admin"]))):
    from backend.utils.assessments import save_home_evaluation
    return save_home_evaluation(db, current_user, payload)


@router.get("/parent/domains-progress/{student_lrn}", response_model=list[DomainProgress])
def get_parent_domains_progress_flat(student_lrn: str, db: Session = Depends(get_db), current_user=Depends(verify_role(["user", "super-admin"]))):
    from backend.utils.assessments import assessment_data, PERIODS
    data = assessment_data(db, current_user, student_lrn, parent_view=True)
    result = []
    for domain in data["domains"]:
        progress = {}
        for period in PERIODS:
            visible = data["summary"][period]["isReleased"]
            count = sum(question["answers"][period] is not None for question in domain["questions"])
            progress[f"{period.value.lower()}_progress"] = (math.floor(count * 100 / len(domain["questions"]) + 0.5) if domain["questions"] else 0) if visible else None
        questions = domain["questions"]
        result.append({"domain_id": domain["domain_id"], "domain_name": domain["domain_name"], "questions": questions, **progress})
    return result


@router.get("/parent/dashboard-stats/{student_lrn}", response_model=ParentDashboardResponse)
def get_parent_dashboard_stats(student_lrn: str, db: Session = Depends(get_db), current_user=Depends(verify_role(["user", "super-admin"]))):
    from backend.utils.assessments import parent_dashboard
    return parent_dashboard(db, current_user, student_lrn)


@router.get("/parent/progress/{student_lrn}", response_model=list[ParentProgressPeriod])
def get_parent_domains_progress(student_lrn: str, db: Session = Depends(get_db), current_user=Depends(verify_role(["user", "super-admin"]))):
    rows = get_parent_domains_progress_flat(student_lrn, db, current_user)
    return [{"period": period.value, "domains": [{"domain_name": row["domain_name"], "progress_percentage": row[f"{period.value.lower()}_progress"]} for row in rows]} for period in TestingPeriod]


@router.post("/evaluate", response_model=EvaluationSaved)
def evaluate_student(payload: EvaluationBatch, db: Session = Depends(get_db), current_user=Depends(verify_role(["admin", "super-admin"]))):
    from backend.utils.assessments import save_evaluation
    return save_evaluation(db, current_user, payload)


@router.get("/student/{student_lrn}", response_model=list[EvaluationPublicResponse])
def get_student_evaluations(student_lrn: str, db: Session = Depends(get_db), current_user=Depends(verify_role(["admin", "super-admin"]))):
    from backend.utils.access import resolve_student, authorize_student
    student = resolve_student(db, student_lrn)
    authorize_student(db, current_user, student)
    return db.query(StudentEccdEvaluation).filter_by(student_id=student.student_id).all()


@router.get("/section/{section_id}/summary", response_model=list[SectionSummaryItem])
def get_section_summary(
    section_id: int,
    testing_period: TestingPeriod,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin", "teacher"])),
):
    from backend.utils.access import current_teacher, teacher_sections
    if current_user.role.value == "admin" and section_id not in teacher_sections(db, current_teacher(db, current_user)):
        raise HTTPException(403, "Section is not assigned to you.")
    students = (
        db.query(Student)
        .filter(Student.section_id == section_id, Student.is_active == True)
        .all()
    )

    summary = []

    for student in students:
        student_evals = (
            db.query(StudentEccdEvaluation, EccdQuestion)
            .join(
                EccdQuestion,
                StudentEccdEvaluation.question_id == EccdQuestion.question_id,
            )
            .filter(
                StudentEccdEvaluation.student_id == student.student_id,
                StudentEccdEvaluation.testing_period == testing_period,
            )
            .all()
        )

        if not student_evals:
            continue

        records = [evaluation for evaluation, _ in student_evals]
        evaluation_date = get_official_testing_date(records, testing_period)
        grading_date = get_grading_date(records, testing_period)

        formatted_evals = []
        for eval_obj, question_obj in student_evals:
            formatted_evals.append(
                {
                    "domain_id": str(question_obj.domain_id),
                    "answer": eval_obj.answer.value,
                }
            )

        decimal_age = calculate_decimal_age(student.date_of_birth, grading_date) if student.date_of_birth and grading_date else None
        try:
            scores = calculate_scores(formatted_evals, decimal_age) if decimal_age is not None else {}
        except ValueError:
            scores = {}

        summary.append(
            {
                "student_lrn": student.masked_lrn,
                "student_id": student.student_id,
                "first_name": student.first_name,
                "last_name": student.last_name,
                "evaluation_date": evaluation_date,
                "decimal_age": decimal_age,
                "scores": scores,
            }
        )

    return summary


@router.get("/export/cards-zip")
def export_eccd_cards(
    query: Annotated[EccdSectionExportQuery, Query()],
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin"])),
):
    from backend.utils.excel import bulk_checklist_response
    return bulk_checklist_response(db, current_user, section_id=query.section_id, school_year=query.school_year)


@router.get("/export/card-single")
def export_eccd_card(
    query: Annotated[EccdStudentExportQuery, Query()],
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin"])),
):
    from backend.utils.excel import checklist_response
    return checklist_response(db, current_user, query.student_id, school_year=query.school_year)


@router.get("/export/section-summary")
def export_eccd_section_summary(
    query: Annotated[EccdSectionExportQuery, Query()],
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin"])),
):
    from backend.utils.excel import summary_response
    return summary_response(db, current_user, section_filter=query.section_id, school_year=query.school_year)


@router.get("/section/{section_id}/export")
def export_section_summary(section_id: PositiveId, query: Annotated[EccdExportYearQuery, Query()], db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin", "admin"]))):
    from backend.utils.excel import summary_response
    return summary_response(db, current_user, section_filter=section_id, school_year=query.school_year)

@router.get("/export-all")
def export_all_eccd(testing_period: TestingPeriod = Query(TestingPeriod.PRE), db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.excel import summary_response
    return summary_response(db, current_user)



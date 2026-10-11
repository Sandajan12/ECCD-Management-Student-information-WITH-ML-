from backend.schemas.eccd import EvaluationBatch, ParentEvaluationBatch, AssessmentResponse, ParentAssessmentResponse, ParentDashboardResponse, EvaluationSaved, EvaluationPublicResponse, DomainProgress
from backend.schemas.student import StudentPublicResponse
from backend.schemas.common import MessageResult
from backend.schemas.operations import DomainProgressResult, ParentProgressPeriod, SectionSummaryItem
import io
from datetime import date

import openpyxl
from backend.config.database import get_db
from backend.models.eccd import (
    EccdAnswer,
    EccdDomain,
    EccdQuestion,
    StudentEccdEvaluation,
    TestingPeriod,
)
from backend.models.student import Student
from backend.models.teacher import Teacher
from backend.models.section import Section
from backend.models.section_teacher import SectionTeacher
from backend.utils.deps import verify_role
from backend.utils.eccd_scorer import calculate_decimal_age, calculate_scores
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl.styles import Alignment, Font
from pydantic import BaseModel
from sqlalchemy import case
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/eccd", tags=["ECCD"])

@router.get("/students", response_model=list[StudentPublicResponse])
def get_teacher_students(db: Session = Depends(get_db), current_user=Depends(verify_role(["admin"]))):
    from backend.routes.students import get_students
    return get_students(db, current_user)


@router.get("/domains-progress", response_model=list[DomainProgressResult])
def get_domains_progress(
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["admin", "teacher"])),
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
            Student.is_active == True,
        )
        .all()
    )
    
    student_lrns = [s.lrn_number for s in students]
    total_students = len(student_lrns)
    
    domains = db.query(EccdDomain).all()
    questions = db.query(EccdQuestion).order_by(EccdQuestion.sequence_order).all()
    
    if total_students > 0:
        evaluations = (
            db.query(StudentEccdEvaluation)
            .filter(StudentEccdEvaluation.student_lrn.in_(student_lrns))
            .all()
        )
    else:
        evaluations = []

    formatted_domains = []
    
    for domain in domains:
        domain_questions = [q for q in questions if q.domain_id == domain.domain_id]
        questions_in_domain = [q.question_id for q in domain_questions]
        total_required_per_student = len(questions_in_domain)
        
        pre_completed_count = 0
        mid_completed_count = 0
        post_completed_count = 0
        
        if total_required_per_student > 0 and total_students > 0:
            for lrn in student_lrns:
                pre_count = 0
                mid_count = 0
                post_count = 0
                
                for e in evaluations:
                    if e.student_lrn == lrn and e.question_id in questions_in_domain:
                        if e.testing_period == TestingPeriod.PRE:
                            pre_count += 1
                        elif e.testing_period == TestingPeriod.MID:
                            mid_count += 1
                        elif e.testing_period == TestingPeriod.POST:
                            post_count += 1
                
                if pre_count >= total_required_per_student:
                    pre_completed_count += 1
                if mid_count >= total_required_per_student:
                    mid_completed_count += 1
                if post_count >= total_required_per_student:
                    post_completed_count += 1
                    
        pre_progress = round((pre_completed_count / total_students) * 100) if total_students > 0 else 0
        mid_progress = round((mid_completed_count / total_students) * 100) if total_students > 0 else 0
        post_progress = round((post_completed_count / total_students) * 100) if total_students > 0 else 0
        
        formatted_domains.append({
            "domain_id": domain.domain_id,
            "domain_name": domain.domain_name,
            "questions": [
                {
                    "question_id": q.question_id,
                    "question_text": q.question_text,
                    "sequence_order": q.sequence_order,
                } for q in domain_questions
            ],
            "pre_progress": pre_progress,
            "mid_progress": mid_progress,
            "post_progress": post_progress
        })
        
    return formatted_domains


@router.get("/assessment/{lrn}", response_model=AssessmentResponse)
def get_assessment_data(lrn: str, db: Session = Depends(get_db), current_user=Depends(verify_role(["admin", "super-admin"]))):
    from backend.utils.assessments import assessment_data
    return assessment_data(db, current_user, lrn)



from backend.models.parent import FamilyAccess, Parent


@router.get("/parent/assessment/{student_lrn}", response_model=ParentAssessmentResponse)
def get_parent_assessment_data(student_lrn: str, db: Session = Depends(get_db), current_user=Depends(verify_role(["user", "super-admin"]))):
    from backend.utils.assessments import assessment_data
    return assessment_data(db, current_user, student_lrn, parent_view=True)


@router.post("/parent/evaluate", response_model=MessageResult)
def evaluate_student_parent(payload: ParentEvaluationBatch, db: Session = Depends(get_db), current_user=Depends(verify_role(["user"]))):
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
            progress[f"{period.value.lower()}_progress"] = round(count * 100 / len(domain["questions"])) if visible else None
        result.append({"domain_id": domain["domain_id"], "domain_name": domain["domain_name"], **progress})
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
                StudentEccdEvaluation.student_lrn == student.lrn_number,
                StudentEccdEvaluation.testing_period == testing_period,
            )
            .all()
        )

        if not student_evals:
            continue

        evaluation_date = student_evals[0][0].evaluation_date

        formatted_evals = []
        for eval_obj, question_obj in student_evals:
            formatted_evals.append(
                {
                    "domain_id": str(question_obj.domain_id),
                    "answer": eval_obj.answer.value,
                }
            )

        decimal_age = calculate_decimal_age(student.date_of_birth, evaluation_date) if student.date_of_birth else 4.0
        try:
            scores = calculate_scores(formatted_evals, decimal_age)
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


@router.get("/section/{section_id}/export")
def export_section_summary(section_id: int, testing_period: TestingPeriod = Query(TestingPeriod.PRE), db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin", "admin"]))):
    from backend.utils.excel import summary_response
    return summary_response(db, current_user, section_filter=section_id)

@router.get("/export-all")
def export_all_eccd(testing_period: TestingPeriod = Query(TestingPeriod.PRE), db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.excel import summary_response
    return summary_response(db, current_user)



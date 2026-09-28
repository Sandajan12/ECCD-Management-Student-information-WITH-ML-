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

class StudentBasic(BaseModel):
    lrn_number: str
    first_name: str
    last_name: str

@router.get("/students", response_model=list[StudentBasic])
def get_teacher_students(
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["admin", "teacher"])),
):
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
    if not teacher:
        raise HTTPException(status_code=403, detail="Teacher account not found.")

    students = (
        db.query(Student)
        .join(Section, Student.section_id == Section.section_id)
        .join(SectionTeacher, Section.section_id == SectionTeacher.section_id)
        .filter(
            SectionTeacher.teacher_id == teacher.teacher_id,
            SectionTeacher.status == "Active",
            Student.is_active == True,
        )
        .order_by(Student.last_name.asc())
        .all()
    )
    return students


@router.get("/domains-progress")
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


@router.get("/assessment/{lrn}")
def get_assessment_data(
    lrn: str,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["admin", "teacher"])),
):
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
    if not teacher:
        raise HTTPException(status_code=403, detail="Teacher not found.")

    student = (
        db.query(Student)
        .join(Section, Student.section_id == Section.section_id)
        .join(SectionTeacher, Section.section_id == SectionTeacher.section_id)
        .filter(
            Student.lrn_number == lrn,
            SectionTeacher.teacher_id == teacher.teacher_id,
            SectionTeacher.status == "Active",
        )
        .first()
    )
    if not student:
        raise HTTPException(status_code=403, detail="Student not found in your class.")

    domains = db.query(EccdDomain).all()
    questions = db.query(EccdQuestion).order_by(EccdQuestion.sequence_order).all()

    evaluations = (
        db.query(StudentEccdEvaluation)
        .filter(StudentEccdEvaluation.student_lrn == lrn)
        .all()
    )

    eval_ages = {}
    if student.date_of_birth:
        for domain in domains:
            domain_id = str(domain.domain_id)
            eval_ages[domain_id] = {"PRE": None, "MID": None, "POST": None}
            domain_question_ids = [q.question_id for q in questions if q.domain_id == domain.domain_id]

            for period in [TestingPeriod.PRE, TestingPeriod.MID, TestingPeriod.POST]:
                eval_for_period = next(
                    (e for e in evaluations if e.testing_period == period and e.evaluation_date and e.question_id in domain_question_ids),
                    None
                )
                if eval_for_period:
                    eval_ages[domain_id][period.value] = calculate_decimal_age(student.date_of_birth, eval_for_period.evaluation_date)

    formatted_domains = []
    for domain in domains:
        domain_questions = []
        for q in questions:
            if q.domain_id == domain.domain_id:
                pre_ans = next((e for e in evaluations if e.question_id == q.question_id and e.testing_period == TestingPeriod.PRE), None)
                mid_ans = next((e for e in evaluations if e.question_id == q.question_id and e.testing_period == TestingPeriod.MID), None)
                post_ans = next((e for e in evaluations if e.question_id == q.question_id and e.testing_period == TestingPeriod.POST), None)
                
                domain_questions.append({
                    "question_id": q.question_id,
                    "question_text": q.question_text,
                    "sequence_order": q.sequence_order,
                    "answers": {
                        "PRE": pre_ans.answer.value if pre_ans else None,
                        "MID": mid_ans.answer.value if mid_ans else None,
                        "POST": post_ans.answer.value if post_ans else None
                    }
                })

        formatted_domains.append({
            "domain_id": domain.domain_id,
            "domain_name": domain.domain_name,
            "questions": domain_questions
        })

    evaluation_dates = {"PRE": None, "MID": None, "POST": None}
    if evaluations:
        for period in [TestingPeriod.PRE, TestingPeriod.MID, TestingPeriod.POST]:
            dates = [e.evaluation_date for e in evaluations if e.testing_period == period and e.evaluation_date]
            if dates:
                evaluation_dates[period.value] = max(dates)

    return {"domains": formatted_domains, "evalAges": eval_ages, "evaluationDates": evaluation_dates}


class ParentEvaluationItem(BaseModel):
    question_id: int
    testing_period: TestingPeriod
    answer: EccdAnswer

class ParentBulkEvaluationRequest(BaseModel):
    student_lrn: str
    evaluations: list[ParentEvaluationItem]

class TeacherEvaluationItem(BaseModel):
    question_id: int
    testing_period: TestingPeriod
    answer: EccdAnswer

class TeacherBulkEvaluationRequest(BaseModel):
    student_lrn: str
    testing_period: TestingPeriod
    assessment_date: date
    evaluations: list[TeacherEvaluationItem]


from backend.models.parent import FamilyAccess, Parent


@router.get("/parent/assessment/{student_lrn}")
def get_parent_assessment_data(
    student_lrn: str,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["user", "parent"])),
):
    # Verify parent is linked to student
    parent = db.query(Parent).filter(Parent.user_id == current_user.user_id).first()
    if not parent:
        raise HTTPException(status_code=403, detail="Parent profile not found")

    link = (
        db.query(FamilyAccess)
        .filter(
            FamilyAccess.parent_id == parent.parent_id,
            FamilyAccess.student_lrn == student_lrn,
        )
        .first()
    )
    if not link:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this student"
        )

    student = db.query(Student).filter(Student.lrn_number == student_lrn).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    domains = db.query(EccdDomain).order_by(EccdDomain.domain_id).all()
    questions = (
        db.query(EccdQuestion)
        .filter(EccdQuestion.is_home_based == True)
        .order_by(EccdQuestion.sequence_order)
        .all()
    )

    evaluations = (
        db.query(StudentEccdEvaluation)
        .filter(StudentEccdEvaluation.student_lrn == student_lrn)
        .all()
    )

    eval_ages = {}
    if student.date_of_birth:
        for domain in domains:
            domain_id = str(domain.domain_id)
            eval_ages[domain_id] = {"PRE": None, "MID": None, "POST": None}
            domain_q_ids = [q.question_id for q in questions if q.domain_id == domain.domain_id]

            for period in [TestingPeriod.PRE, TestingPeriod.MID, TestingPeriod.POST]:
                eval_for_period = next(
                    (e for e in evaluations if e.testing_period == period and e.evaluation_date and e.question_id in domain_q_ids),
                    None
                )
                if eval_for_period:
                    eval_ages[domain_id][period.value] = calculate_decimal_age(student.date_of_birth, eval_for_period.evaluation_date)

    formatted_domains = []
    for d in domains:
        domain_questions = []
        for q in questions:
            if q.domain_id == d.domain_id:
                pre_ans = next((e for e in evaluations if e.question_id == q.question_id and e.testing_period == TestingPeriod.PRE), None)
                mid_ans = next((e for e in evaluations if e.question_id == q.question_id and e.testing_period == TestingPeriod.MID), None)
                post_ans = next((e for e in evaluations if e.question_id == q.question_id and e.testing_period == TestingPeriod.POST), None)

                domain_questions.append({
                    "question_id": q.question_id,
                    "question_text": q.question_text,
                    "sequence_order": q.sequence_order,
                    "answers": {
                        "PRE": pre_ans.answer.value if pre_ans else None,
                        "MID": mid_ans.answer.value if mid_ans else None,
                        "POST": post_ans.answer.value if post_ans else None
                    }
                })

        if domain_questions:
            formatted_domains.append({
                "domain_id": d.domain_id,
                "domain_name": d.domain_name,
                "questions": domain_questions
            })

    evaluation_dates = {"PRE": None, "MID": None, "POST": None}
    if evaluations:
        for period in [TestingPeriod.PRE, TestingPeriod.MID, TestingPeriod.POST]:
            dates = [e.evaluation_date for e in evaluations if e.testing_period == period and e.evaluation_date]
            if dates:
                evaluation_dates[period.value] = max(dates)

    teacher_rec = None
    if student.section_id:
        st_rec = (
            db.query(SectionTeacher)
            .filter(SectionTeacher.section_id == student.section_id, SectionTeacher.status == "Active")
            .first()
        )
        if st_rec and st_rec.teacher:
            teacher_rec = st_rec.teacher
        elif student.section and student.section.adviser:
            teacher_rec = student.section.adviser

    can_edit_home_based = bool(teacher_rec and teacher_rec.allow_parent_edit_home_based_eccd)

    return {
        "domains": formatted_domains, 
        "evalAges": eval_ages, 
        "evaluationDates": evaluation_dates,
        "can_edit_home_based": can_edit_home_based,
    }


@router.post("/parent/evaluate")
def evaluate_student_parent(
    payload: ParentBulkEvaluationRequest,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["user", "parent"])),
):
    # Verify parent is linked to student
    parent = db.query(Parent).filter(Parent.user_id == current_user.user_id).first()
    if not parent:
        raise HTTPException(status_code=403, detail="Parent profile not found")

    link = (
        db.query(FamilyAccess)
        .filter(
            FamilyAccess.parent_id == parent.parent_id,
            FamilyAccess.student_lrn == payload.student_lrn,
        )
        .first()
    )
    if not link:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this student"
        )

    # Verify Teacher allows home-based edit
    student = (
        db.query(Student).filter(Student.lrn_number == payload.student_lrn).first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    teacher = None
    if student.section_id:
        st = (
            db.query(SectionTeacher)
            .filter(SectionTeacher.section_id == student.section_id, SectionTeacher.status == "Active")
            .first()
        )
        if st and st.teacher:
            teacher = st.teacher
        elif student.section and student.section.adviser:
            teacher = student.section.adviser

    if not teacher or not teacher.allow_parent_edit_home_based_eccd:
        raise HTTPException(
            status_code=403,
            detail="The Class Adviser has disabled Home-Based Evaluations at this time.",
        )

    # Database Upsert/Insert
    today = date.today()
    for item in payload.evaluations:
        eval_record = (
            db.query(StudentEccdEvaluation)
            .filter(
                StudentEccdEvaluation.student_lrn == payload.student_lrn,
                StudentEccdEvaluation.question_id == item.question_id,
                StudentEccdEvaluation.testing_period == item.testing_period,
            )
            .first()
        )

        if eval_record:
            if eval_record.answer != item.answer:
                eval_record.answer = item.answer
                eval_record.evaluation_date = today
        else:
            new_eval = StudentEccdEvaluation(
                student_lrn=payload.student_lrn,
                question_id=item.question_id,
                testing_period=item.testing_period,
                answer=item.answer,
                evaluation_date=today,
            )
            db.add(new_eval)

    db.commit()
    return {"message": "Home-Based Evaluations saved successfully!"}


@router.get("/parent/domains-progress/{student_lrn}")
def get_parent_domains_progress_flat(
    student_lrn: str,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["user", "parent", "super-admin", "admin", "teacher"])),
):
    if current_user.role in ["user", "parent"]:
        parent = db.query(Parent).filter(Parent.user_id == current_user.user_id).first()
        link = (
            db.query(FamilyAccess)
            .filter(
                FamilyAccess.parent_id == parent.parent_id,
                FamilyAccess.student_lrn == student_lrn,
            )
            .first()
            if parent
            else None
        )
        if not link:
            raise HTTPException(status_code=403, detail="Not authorized")

    domains = db.query(EccdDomain).all()
    questions = (
        db.query(EccdQuestion)
        .filter(EccdQuestion.is_home_based == True)
        .order_by(EccdQuestion.sequence_order.asc())
        .all()
    )
    evaluations = (
        db.query(StudentEccdEvaluation.question_id, StudentEccdEvaluation.testing_period)
        .filter(StudentEccdEvaluation.student_lrn == student_lrn)
        .all()
    )

    formatted_domains = []
    for domain in domains:
        domain_questions = [q for q in questions if q.domain_id == domain.domain_id]
        if not domain_questions:
            continue
        q_ids = {q.question_id for q in domain_questions}
        total_required = len(q_ids)

        pre_count = sum(1 for e in evaluations if e.question_id in q_ids and e.testing_period == TestingPeriod.PRE)
        mid_count = sum(1 for e in evaluations if e.question_id in q_ids and e.testing_period == TestingPeriod.MID)
        post_count = sum(1 for e in evaluations if e.question_id in q_ids and e.testing_period == TestingPeriod.POST)

        pre_prog = round((pre_count / total_required) * 100) if total_required > 0 else 0
        mid_prog = round((mid_count / total_required) * 100) if total_required > 0 else 0
        post_prog = round((post_count / total_required) * 100) if total_required > 0 else 0

        formatted_domains.append({
            "domain_id": domain.domain_id,
            "domain_name": domain.domain_name,
            "pre_progress": pre_prog,
            "mid_progress": mid_prog,
            "post_progress": post_prog,
        })

    return formatted_domains


@router.get("/parent/dashboard-stats/{student_lrn}")
def get_parent_dashboard_stats(
    student_lrn: str,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["user", "parent", "super-admin", "admin", "teacher"])),
):
    if current_user.role in ["user", "parent"]:
        parent = db.query(Parent).filter(Parent.user_id == current_user.user_id).first()
        link = (
            db.query(FamilyAccess)
            .filter(
                FamilyAccess.parent_id == parent.parent_id,
                FamilyAccess.student_lrn == student_lrn,
            )
            .first()
            if parent
            else None
        )
        if not link:
            raise HTTPException(status_code=403, detail="Not authorized")

    evals = (
        db.query(StudentEccdEvaluation, EccdQuestion, EccdDomain)
        .join(EccdQuestion, StudentEccdEvaluation.question_id == EccdQuestion.question_id)
        .join(EccdDomain, EccdQuestion.domain_id == EccdDomain.domain_id)
        .filter(StudentEccdEvaluation.student_lrn == student_lrn)
        .all()
    )

    if not evals:
        return {
            "currentPhase": "Not Started",
            "latestPhase": None,
            "excelsIn": "No Data",
            "needsSupportIn": "No Data",
            "assessmentMastered": False,
            "totalKaya": 0,
            "totalDiKaya": 0,
        }

    periods_present = {e[0].testing_period for e in evals}
    if TestingPeriod.POST in periods_present:
        latest_period = TestingPeriod.POST
        current_phase_label = "Post-Test"
        latest_phase_key = "POST"
    elif TestingPeriod.MID in periods_present:
        latest_period = TestingPeriod.MID
        current_phase_label = "Mid-Test"
        latest_phase_key = "MID"
    elif TestingPeriod.PRE in periods_present:
        latest_period = TestingPeriod.PRE
        current_phase_label = "Pre-Test"
        latest_phase_key = "PRE"
    else:
        return {
            "currentPhase": "Not Started",
            "latestPhase": None,
            "excelsIn": "No Data",
            "needsSupportIn": "No Data",
            "assessmentMastered": False,
            "totalKaya": 0,
            "totalDiKaya": 0,
        }

    latest_evals = [e for e in evals if e[0].testing_period == latest_period]
    domain_data = {}
    for eval_obj, q_obj, d_obj in latest_evals:
        d_name = d_obj.domain_name
        if d_name not in domain_data:
            domain_data[d_name] = {"kaya": 0, "di_kaya": 0, "total": 0}
        domain_data[d_name]["total"] += 1
        ans_val = eval_obj.answer.value if hasattr(eval_obj.answer, "value") else str(eval_obj.answer)
        if ans_val == "KAYA":
            domain_data[d_name]["kaya"] += 1
        elif ans_val == "DI-KAYA":
            domain_data[d_name]["di_kaya"] += 1

    total_kaya = sum(d["kaya"] for d in domain_data.values())
    total_di_kaya = sum(d["di_kaya"] for d in domain_data.values())
    total_evals_count = sum(d["total"] for d in domain_data.values())

    sorted_domains = sorted(domain_data.keys())

    if total_kaya == 0 and total_di_kaya == 0:
        excels_in = "No Data"
        needs_support_in = "No Data"
        is_mastered = False
    else:
        domain_percentages = {
            name: (domain_data[name]["kaya"] / domain_data[name]["total"]) * 100
            for name in sorted_domains
        }
        max_pct = max(domain_percentages.values())
        excels_in = next(name for name in sorted_domains if domain_percentages[name] == max_pct)

        if latest_period == TestingPeriod.POST and total_di_kaya == 0 and total_evals_count > 0:
            is_mastered = True
            needs_support_in = "All Skills Mastered"
        elif total_di_kaya == 0:
            is_mastered = False
            needs_support_in = "None (All Passed)"
        else:
            is_mastered = False
            min_pct = min(domain_percentages.values())
            needs_support_in = next(name for name in sorted_domains if domain_percentages[name] == min_pct)

    return {
        "currentPhase": current_phase_label,
        "latestPhase": latest_phase_key,
        "excelsIn": excels_in,
        "needsSupportIn": needs_support_in,
        "assessmentMastered": is_mastered,
        "totalKaya": total_kaya,
        "totalDiKaya": total_di_kaya,
    }


@router.get("/parent/progress/{student_lrn}")
def get_parent_domains_progress(
    student_lrn: str,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["user", "parent", "super-admin", "admin", "teacher"])),
):
    parent = db.query(Parent).filter(Parent.user_id == current_user.user_id).first()
    link = (
        db.query(FamilyAccess)
        .filter(
            FamilyAccess.parent_id == parent.parent_id,
            FamilyAccess.student_lrn == student_lrn,
        )
        .first()
        if parent
        else None
    )
    if not link:
        raise HTTPException(status_code=403, detail="Not authorized")

    domains = db.query(EccdDomain).all()
    result = []

    for period in [TestingPeriod.PRE, TestingPeriod.MID, TestingPeriod.POST]:
        period_data = {"period": period.value, "domains": []}

        for d in domains:
            home_based_questions = (
                db.query(EccdQuestion)
                .filter(
                    EccdQuestion.domain_id == d.domain_id,
                    EccdQuestion.is_home_based == True,
                )
                .count()
            )

            if home_based_questions == 0:
                continue

            answered = (
                db.query(StudentEccdEvaluation)
                .join(EccdQuestion)
                .filter(
                    StudentEccdEvaluation.student_lrn == student_lrn,
                    StudentEccdEvaluation.testing_period == period,
                    EccdQuestion.domain_id == d.domain_id,
                    EccdQuestion.is_home_based == True,
                )
                .count()
            )

            progress = (
                (answered / home_based_questions) * 100
                if home_based_questions > 0
                else 0
            )

            period_data["domains"].append(
                {
                    "domain_name": d.domain_name,
                    "progress_percentage": round(progress, 1),
                }
            )

        result.append(period_data)

    return result


@router.post("/evaluate")
def evaluate_student(
    payload: TeacherBulkEvaluationRequest,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin"])),
):
    # 1. Date Validation Logic (Chronological Enforcement)
    existing_evals = (
        db.query(StudentEccdEvaluation)
        .filter(StudentEccdEvaluation.student_lrn == payload.student_lrn)
        .all()
    )

    pre_date = next(
        (
            e.evaluation_date
            for e in existing_evals
            if e.testing_period == TestingPeriod.PRE
        ),
        None,
    )
    mid_date = next(
        (
            e.evaluation_date
            for e in existing_evals
            if e.testing_period == TestingPeriod.MID
        ),
        None,
    )

    if payload.testing_period == TestingPeriod.MID and pre_date:
        if payload.assessment_date < pre_date:
            raise HTTPException(
                status_code=400, detail="MID-test date cannot be before PRE-test date."
            )

    if payload.testing_period == TestingPeriod.POST and mid_date:
        if payload.assessment_date < mid_date:
            raise HTTPException(
                status_code=400, detail="POST-test date cannot be before MID-test date."
            )

    # 2. Database Upsert/Insert
    for item in payload.evaluations:
        # STRICT ISOLATION: Ignore any payload items that do not match the explicitly submitted testing period
        if item.testing_period != payload.testing_period:
            continue

        eval_record = (
            db.query(StudentEccdEvaluation)
            .filter(
                StudentEccdEvaluation.student_lrn == payload.student_lrn,
                StudentEccdEvaluation.question_id == item.question_id,
                StudentEccdEvaluation.testing_period == item.testing_period,
            )
            .first()
        )

        if eval_record:
            eval_record.answer = item.answer
            eval_record.evaluation_date = payload.assessment_date
        else:
            new_eval = StudentEccdEvaluation(
                student_lrn=payload.student_lrn,
                question_id=item.question_id,
                testing_period=item.testing_period,
                answer=item.answer,
                evaluation_date=payload.assessment_date,
            )
            db.add(new_eval)

    db.commit()
    return {"message": "ECCD Evaluations saved successfully!"}


@router.get("/student/{student_lrn}")
def get_student_evaluations(
    student_lrn: str,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin", "teacher"])),
):
    period_sort_logic = case(
        (StudentEccdEvaluation.testing_period == TestingPeriod.PRE, 1),
        (StudentEccdEvaluation.testing_period == TestingPeriod.MID, 2),
        (StudentEccdEvaluation.testing_period == TestingPeriod.POST, 3),
        else_=4,
    )

    evaluations = (
        db.query(StudentEccdEvaluation)
        .filter(StudentEccdEvaluation.student_lrn == student_lrn)
        .order_by(period_sort_logic)
        .all()
    )

    return evaluations


@router.get("/section/{section_id}/summary")
def get_section_summary(
    section_id: int,
    testing_period: TestingPeriod,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin", "teacher"])),
):
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

        decimal_age = calculate_decimal_age(student.date_of_birth, evaluation_date)
        try:
            scores = calculate_scores(formatted_evals, decimal_age)
        except ValueError:
            scores = {}

        summary.append(
            {
                "student_lrn": student.lrn_number,
                "first_name": student.first_name,
                "last_name": student.last_name,
                "evaluation_date": evaluation_date,
                "decimal_age": decimal_age,
                "scores": scores,
            }
        )

    return summary


@router.get("/section/{section_id}/export")
def export_section_summary(
    section_id: int,
    testing_period: TestingPeriod,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin", "teacher"])),
):
    # Retrieve the summary data
    summary_data = get_section_summary(section_id, testing_period, db, current_user)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"{testing_period.value} ECCD Summary"

    headers = [
        "LRN",
        "Student Name",
        "Decimal Age",
        "Gross Motor",
        "Fine Motor",
        "Self-Help",
        "Receptive Lang",
        "Expressive Lang",
        "Cognitive",
        "Socio-Emotional",
        "Standard Score",
        "Interpretation",
    ]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal="center")

    for data in summary_data:
        scores = data.get("scores", {})
        scaled = scores.get("scaled_scores", {})
        row = [
            data["student_lrn"],
            f"{data['last_name']}, {data['first_name']}",
            data["decimal_age"],
            scaled.get("GM", ""),
            scaled.get("FM", ""),
            scaled.get("SH", ""),
            scaled.get("RL", ""),
            scaled.get("EL", ""),
            scaled.get("C", ""),
            scaled.get("SE", ""),
            scores.get("standard_score", ""),
            scores.get("interpretation", ""),
        ]
        ws.append(row)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    headers = {
        "Content-Disposition": f'attachment; filename="ECCD_Section_{section_id}_{testing_period.value}_Report.xlsx"'
    }

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )

@router.get("/export-all")
def export_all_eccd(
    testing_period: TestingPeriod = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "chairman"])),
):
    import io
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "All Sections ECCD"
    ws.append(["Student LRN", "Name", "Section", "Standard Score", "Interpretation"])
    
    # Just a placeholder for now to prevent 404s
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    headers = {
        "Content-Disposition": f'attachment; filename="ECCD_All_{testing_period.value}_Report.xlsx"'
    }

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )



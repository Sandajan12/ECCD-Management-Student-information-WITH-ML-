"""Saved section prerequisites shared by teacher navigation and assessment saves."""
from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models import EccdQuestion, Section, Student, StudentEccdEvaluation, User
from backend.models.eccd import TestingPeriod
from backend.schemas.eccd import IncompleteAssessmentStudent, SectionPeriodGates
from backend.utils.access import current_teacher, teacher_sections
from backend.utils.audit import person_name
from backend.utils.eccd_dates import get_official_testing_date


def section_period_gates(db: Session, section_id: int) -> SectionPeriodGates:
    required = {row[0] for row in db.query(EccdQuestion.question_id)}
    students = db.query(Student).filter(
        Student.section_id == section_id, Student.is_active.is_(True)
    ).order_by(Student.last_name, Student.first_name, Student.student_id).all()
    records = defaultdict(list)
    if students:
        for row in db.query(StudentEccdEvaluation).filter(
            StudentEccdEvaluation.student_id.in_([s.student_id for s in students]),
            StudentEccdEvaluation.testing_period.in_([TestingPeriod.PRE, TestingPeriod.MID]),
        ):
            records[(row.student_id, row.testing_period)].append(row)
    prerequisites = {}
    for period in (TestingPeriod.PRE, TestingPeriod.MID):
        incomplete = []
        for student in students:
            saved = records[(student.student_id, period)]
            count = len(required.intersection(row.question_id for row in saved if row.answer is not None))
            missing_date = get_official_testing_date(saved, period) is None
            if not required or count < len(required) or missing_date:
                incomplete.append(IncompleteAssessmentStudent(
                    student_id=student.student_id, full_name=person_name(student),
                    masked_lrn=student.masked_lrn, saved_count=count,
                    missing_testing_date=missing_date,
                ))
        prerequisites[period.value] = incomplete
    return SectionPeriodGates(section_id=section_id, required_question_count=len(required), prerequisites=prerequisites)


def authorized_period_gates(db: Session, user: User, section_id: int) -> SectionPeriodGates:
    if user.role.value != "super-admin" and section_id not in teacher_sections(db, current_teacher(db, user)):
        raise HTTPException(403, "Section is not assigned to you.")
    if db.get(Section, section_id) is None:
        raise HTTPException(404, "Section not found.")
    return section_period_gates(db, section_id)


def guard_section_period(db: Session, student: Student, period: TestingPeriod) -> None:
    if period == TestingPeriod.PRE:
        return
    if student.section_id is None:
        raise HTTPException(409, "Assign this student to a section before assessing later periods.")
    gates = section_period_gates(db, student.section_id)
    for prerequisite in (("PRE",) if period == TestingPeriod.MID else ("PRE", "MID")):
        remaining = len(gates.prerequisites[prerequisite])
        if remaining:
            label = "Pre-Test" if prerequisite == "PRE" else "Mid-Test"
            raise HTTPException(409, f"Complete {label} ({prerequisite}) for {remaining} remaining active student(s) in this section before saving {period.value}.")

"""Persist explicit prerequisite records for tests exercising later-period saves."""
from datetime import date

from backend.models import EccdQuestion, StudentEccdEvaluation


def complete_period(db, student_id=1, period="PRE", when=date(2026, 8, 1), provisional_home=False):
    existing = {r.question_id: r for r in db.query(StudentEccdEvaluation).filter_by(
        student_id=student_id, testing_period=period)}
    for question_id, home in db.query(EccdQuestion.question_id, EccdQuestion.is_home_based):
        if question_id in existing:
            continue
        db.add(StudentEccdEvaluation(
            student_id=student_id, question_id=question_id, testing_period=period,
            answer="DI-KAYA", evaluator_role="parent" if provisional_home and home else "teacher", teacher_id=None if provisional_home and home else 1,
            teacher_evaluation_date=None if provisional_home and home else when, evaluation_date=when,
        ))
    db.commit()

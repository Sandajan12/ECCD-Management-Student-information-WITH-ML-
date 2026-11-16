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
def materialize_legacy_observations(fixture):
    """Convert submitted fixtures to pre-021 records for historical compatibility tests.

    Exercise the new acceptance path, then remove only the review confirmation to
    reproduce historical parent-only provenance. New review behavior has its own suite.
    """
    from backend.models import ParentHomeObservation, Student
    from backend.utils.access import get_active_adviser_for_student
    with fixture.sessions() as db:
        actor = get_active_adviser_for_student(db.get(Student, 1), db).user_id
    response = fixture.call("GET", "/api/eccd/home-observations/pending", actor)
    assert response.status_code == 200, response.text
    pending = response.json()
    if not pending:
        return
    response = fixture.call("POST", "/api/eccd/home-observations/review", actor, json={"student_id": 1,
        "decisions": [{"observation_id": r["observation_id"], "status": "accepted"} for r in pending]})
    assert response.status_code == 200, response.text
    with fixture.sessions() as db:
        db.query(ParentHomeObservation).filter(ParentHomeObservation.observation_id.in_([r["observation_id"] for r in pending])).delete(synchronize_session=False)
        db.commit()

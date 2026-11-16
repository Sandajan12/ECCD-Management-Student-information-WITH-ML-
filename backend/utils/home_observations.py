"""Validate complete batches before creating any official assessment rows."""
from fastapi import HTTPException
from sqlalchemy.orm import selectinload
from backend.models import ParentHomeObservation, StudentEccdEvaluation, Student, Parent, Section, EccdQuestion
from backend.models.eccd import TestingPeriod
from backend.schemas.eccd import AssessmentAnswer
from backend.utils.access import authorize_student, current_teacher, require_parent_visible_student, permissions_for_student
from backend.utils.assessment_access import PERIOD_FLAGS, PERIOD_LABELS, window_values
from backend.utils.eccd_dates import now_pht
from backend.utils.mastery import guard_pre_mastery


def lock_student(db, user, student):
    db.query(Student).filter_by(student_id=student.student_id).populate_existing().with_for_update().one()
    authorize_student(db, user, student)
    require_parent_visible_student(db, student)


def parent_question_access(db, user, student, question_id, period):
    lock_student(db, user, student)
    parent = db.query(Parent).filter_by(user_id=user.user_id).one()
    section = db.query(Section).filter_by(section_id=student.section_id).populate_existing().with_for_update().first()
    if not permissions_for_student(db, student).allow_parent_edit_home_based_eccd:
        raise HTTPException(403, "Editing is currently locked by the Class Adviser.")
    if not window_values(section)[PERIOD_FLAGS[period.value]]:
        raise HTTPException(403, f"Editing for {PERIOD_LABELS[period.value]} is currently closed by the teacher.")
    question = db.get(EccdQuestion, question_id)
    if not question:
        raise HTTPException(400, "Unknown assessment question.")
    if not question.is_home_based:
        raise HTTPException(403, "Parents are only permitted to assess home-based questions.")
    return parent


def guard_pending(db, student_id, answers):
    keys = {(row.question_id, row.testing_period) for row in answers}
    if any((r.question_id, r.testing_period) in keys for r in db.query(ParentHomeObservation).filter_by(student_id=student_id, status="pending")):
        raise HTTPException(409, "Review pending home observations before saving assessment answers.")


def public_observation(row):
    return dict(observation_id=row.observation_id, student_id=row.student_id, question_id=row.question_id,
                testing_period=row.testing_period, answer=row.answer, status=row.status, submitted_at=row.submitted_at,
                has_photo=bool(row.status == "pending" and row.photo and row.photo.ready and row.photo.object_key and not row.photo.delete_pending))


def save_review(db, user, student, payload, storage):
    from backend.utils.home_photos import cleanup_photos
    lock_student(db, user, student)
    teacher = current_teacher(db, user)
    rows = {r.observation_id: r for r in db.query(ParentHomeObservation).filter_by(student_id=student.student_id)
            .order_by(ParentHomeObservation.observation_id).with_for_update()}
    existing = db.query(StudentEccdEvaluation).options(selectinload(StudentEccdEvaluation.home_review)).filter_by(student_id=student.student_id).all()
    by_key = {(r.question_id, r.testing_period): r for r in existing}
    decisions = sorted(payload.decisions, key=lambda d: (list(TestingPeriod).index(TestingPeriod(rows[d.observation_id].testing_period))
                                                        if d.observation_id in rows else 9, d.observation_id))
    accepted_answers = []
    for decision in decisions:
        row = rows.get(decision.observation_id)
        if row is None:
            raise HTTPException(409, "Review changed. Refresh the pending list.")
        if row.status != "pending":
            if row.status == decision.status:
                continue
            raise HTTPException(409, "This observation has already been reviewed.")
        if (row.question_id, row.testing_period) in by_key:
            raise HTTPException(409, "An assessment answer already exists. Refresh before reviewing.")
        if decision.status == "accepted":
            answer = AssessmentAnswer(question_id=row.question_id, testing_period=row.testing_period, answer=row.answer)
            # Accepted parent positives are confirmed, including earlier decisions in this same batch.
            guard_pre_mastery(db, existing, [answer])
            for previous in accepted_answers:
                if previous.question_id == answer.question_id and previous.answer == "KAYA" and list(TestingPeriod).index(previous.testing_period) < list(TestingPeriod).index(answer.testing_period) and answer.answer != "KAYA":
                    raise HTTPException(400, "An earlier accepted KAYA requires KAYA in this testing period.")
            accepted_answers.append(answer)
    photos = []
    reviewed_at = now_pht()
    for decision in decisions:
        row = rows[decision.observation_id]
        if row.status == "pending":
            if decision.status == "accepted":
                evaluation = StudentEccdEvaluation(student_id=student.student_id, question_id=row.question_id,
                    testing_period=row.testing_period, answer=row.answer, evaluator_role="parent", parent_id=row.parent_id,
                    parent_submitted_at=row.submitted_at, evaluation_date=row.submitted_at.astimezone(reviewed_at.tzinfo).date())
                db.add(evaluation)
                db.flush()
                row.evaluation_id = evaluation.evaluation_id
            row.status = decision.status
            row.reviewer_id = teacher.teacher_id
            row.reviewed_at = reviewed_at
        if row.photo and row.photo.object_key:
            row.photo.delete_pending = True
            photos.append(row.photo_id)
    db.commit()
    failures = cleanup_photos(db, storage, photo_ids=photos) if photos else 0
    return {"message": "Review saved.", "cleanup_pending": failures}

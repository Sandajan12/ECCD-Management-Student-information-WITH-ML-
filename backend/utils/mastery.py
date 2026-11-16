"""Saved per-question carry-forward shared by assessment reads and write guards."""
from collections.abc import Iterable

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models import EccdQuestion, StudentEccdEvaluation
from backend.models.eccd import EccdAnswer, TestingPeriod
from backend.schemas.eccd import AssessmentAnswer


def completed_pre_kaya(question_ids: set[int], evaluations: Iterable[StudentEccdEvaluation]) -> set[int]:
    confirmed = {
        record.question_id: record.answer
        for record in evaluations
        if record.testing_period == TestingPeriod.PRE and record.teacher_evaluation_date is not None
    }
    if not question_ids or not question_ids.issubset(confirmed):
        return set()
    return {question_id for question_id in question_ids if confirmed[question_id] == EccdAnswer.KAYA}


def carry_sources(evaluations: Iterable[StudentEccdEvaluation], home_ids: set[int]) -> dict[tuple[int, TestingPeriod], tuple[StudentEccdEvaluation, bool]]:
    """Resolve saved sources only; a confirmed positive survives historical later conflicts."""
    records = {(row.question_id, row.testing_period): row for row in evaluations}
    result: dict[tuple[int, TestingPeriod], tuple[StudentEccdEvaluation, bool]] = {}
    for question_id in {key[0] for key in records}:
        source, confirmed_source = None, None
        for period in TestingPeriod:
            prior = confirmed_source if confirmed_source is not None else source
            if prior is not None:
                result[question_id, period] = (prior, confirmed_source is not None)
            row = records.get((question_id, period))
            if row is None:
                continue
            review = getattr(row, "home_review", None)
            teacher_confirmed = (row.evaluator_role == "teacher" or row.teacher_evaluation_date is not None
                                 or bool(review and review.status == "accepted" and review.answer == row.answer
                                         and review.student_id == row.student_id and review.question_id == row.question_id and review.testing_period == row.testing_period))
            if row.answer == EccdAnswer.KAYA:
                source = row
                if teacher_confirmed or question_id not in home_ids:
                    confirmed_source = row
            elif teacher_confirmed:
                # Only a reviewed teacher negative resets provisional parent positives.
                source = None
    return result


def guard_pre_mastery(db: Session, evaluations: list[StudentEccdEvaluation], answers: Iterable[AssessmentAnswer], *, parent: bool = False) -> None:
    later_answers = [answer for answer in answers if answer.testing_period != TestingPeriod.PRE]
    if not later_answers:
        return
    home_ids = {row[0] for row in db.query(EccdQuestion.question_id).filter(EccdQuestion.is_home_based.is_(True))}
    sources = carry_sources(evaluations, home_ids)
    for answer in later_answers:
        source = sources.get((answer.question_id, answer.testing_period))
        if source and (parent or source[1]) and answer.answer != EccdAnswer.KAYA:
            raise HTTPException(400, "A saved earlier KAYA requires KAYA in this testing period. Refresh and review the assessment.")

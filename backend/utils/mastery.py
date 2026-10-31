"""Completed PRE mastery shared by assessment reads and write guards."""
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


def guard_pre_mastery(db: Session, evaluations: list[StudentEccdEvaluation], answers: Iterable[AssessmentAnswer]) -> None:
    later_answers = [answer for answer in answers if answer.testing_period != TestingPeriod.PRE]
    if not later_answers:
        return
    question_ids = {row[0] for row in db.query(EccdQuestion.question_id)}
    mastered = completed_pre_kaya(question_ids, evaluations)
    if any(answer.question_id in mastered and answer.answer != EccdAnswer.KAYA for answer in later_answers):
        raise HTTPException(400, "Items mastered in the completed Pre-Test must remain Kaya in Mid-Test and Post-Test.")

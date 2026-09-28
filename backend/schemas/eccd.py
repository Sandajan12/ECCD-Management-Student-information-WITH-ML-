from datetime import date

from backend.models.eccd import EccdAnswer, TestingPeriod
from pydantic import BaseModel, ConfigDict


# --- DOMAIN SCHEMAS ---
class EccdDomainBase(BaseModel):
    domain_name: str


class EccdDomainResponse(EccdDomainBase):
    domain_id: int
    model_config = ConfigDict(from_attributes=True)


# --- QUESTION SCHEMAS ---
class EccdQuestionBase(BaseModel):
    domain_id: int
    question_text: str
    sequence_order: int
    is_home_based: bool | None = False


class EccdQuestionResponse(EccdQuestionBase):
    question_id: int
    model_config = ConfigDict(from_attributes=True)


# --- EVALUATION SCHEMAS ---
class EvaluationBase(BaseModel):
    teacher_id: int | None = None
    question_id: int
    testing_period: TestingPeriod
    answer: EccdAnswer
    evaluation_date: date


class EvaluationCreate(EvaluationBase):
    student_lrn: str


class EvaluationUpdate(BaseModel):
    answer: EccdAnswer | None = None
    evaluation_date: date | None = None


class EvaluationResponse(EvaluationBase):
    evaluation_id: int
    student_lrn: str
    model_config = ConfigDict(from_attributes=True)

"""Validation contracts for question management, including the legacy routes."""
from pydantic import Field
from .common import ApiModel, MessageResult, PositiveId
from .eccd import EccdDomainBase, EccdDomainResponse, EccdQuestionBase, EccdQuestionResponse


class ConfigDomain(EccdDomainResponse):
    questions: list[EccdQuestionResponse]


class QuestionEdit(ApiModel):
    question_text: str = Field(min_length=1)
    sequence_order: int = Field(ge=1)
    domain_id: PositiveId | None = None
    is_home_based: bool | None = None


class HomeBasedPayload(ApiModel):
    is_home_based: bool


class AddedDomain(MessageResult):
    domain_id: PositiveId


class AddedQuestion(MessageResult):
    question_id: PositiveId

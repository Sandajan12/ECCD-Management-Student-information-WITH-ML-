from datetime import datetime
from typing import Literal
from pydantic import Field, model_validator
from backend.schemas.common import ApiModel, PositiveId
from backend.models.eccd import EccdAnswer, TestingPeriod


class HomeObservationPublic(ApiModel):
    observation_id: PositiveId
    student_id: PositiveId
    question_id: PositiveId
    testing_period: TestingPeriod
    answer: EccdAnswer
    status: Literal["pending", "accepted", "declined"]
    submitted_at: datetime
    has_photo: bool


class HomeReviewDecision(ApiModel):
    observation_id: PositiveId
    status: Literal["accepted", "declined"]


class HomeReviewBatch(ApiModel):
    student_id: PositiveId
    decisions: list[HomeReviewDecision] = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def unique_decisions(self):
        ids = [r.observation_id for r in self.decisions]
        if len(set(ids)) != len(ids):
            raise ValueError("Review decisions must be unique")
        return self


class HomeReviewSaved(ApiModel):
    message: str
    cleanup_pending: int


class HomePhotoUploaded(ApiModel):
    photo_id: str


class HomeObservationMetadata(ApiModel):
    status: Literal["pending", "accepted", "declined", "submitted"]
    answer: EccdAnswer | None = None
    submitted_at: datetime | None = None

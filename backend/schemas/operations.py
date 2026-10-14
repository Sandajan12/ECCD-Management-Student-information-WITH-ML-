"""Typed contracts for administrative lists and spreadsheet operations."""
from datetime import date, datetime
from pydantic import Field, computed_field
from .common import ApiModel, PositiveId


class TeacherListItem(ApiModel):
    teacher_id: PositiveId
    user_id: PositiveId | None = None
    username: str | None = None
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    employee_id: str | None = None
    class_name: str | None = None
    section_name: str | None = None
    section_id: PositiveId | None = None
    role: str | None = None
    allow_eccd_question_management: bool = False
    is_active: bool


class ChairmanSectionItem(ApiModel):
    section_id: PositiveId
    section_name: str
    adviser_teacher_id: PositiveId | None = None
    first_name: str | None = None
    last_name: str | None = None
    role: str | None = None
    status: str | None = None
    is_active: bool | None = None


class ImportErrorItem(ApiModel):
    row: int = Field(ge=3)
    error: str


class ImportResult(ApiModel):
    successCount: int = Field(ge=0)
    failedCount: int = Field(ge=0)
    errors: list[ImportErrorItem]


class ScoreResult(ApiModel):
    raw_scores: dict[str, int] = Field(default_factory=dict)
    scaled_scores: dict[str, int] = Field(default_factory=dict)
    sum_of_scaled_scores: int | None = None
    standard_score: int | None = None
    interpretation: str | None = None
    bracket: str | None = None


class SectionSummaryItem(ApiModel):
    student_id: PositiveId
    student_lrn: str
    first_name: str | None = None
    last_name: str | None = None
    evaluation_date: date | None = None
    decimal_age: float
    scores: ScoreResult


class ProgressItem(ApiModel):
    domain_name: str
    PRE: float
    MID: float
    POST: float


class DomainProgressResult(ApiModel):
    domain_id: PositiveId
    domain_name: str
    questions: list['ProgressQuestion']
    pre_progress: int
    mid_progress: int
    post_progress: int


class ProgressQuestion(ApiModel):
    question_id: PositiveId
    domain_id: PositiveId
    question_text: str
    sequence_order: int
    is_home_based: bool | None


class ParentProgressDomain(ApiModel):
    domain_name: str
    progress_percentage: int | None


class ParentProgressPeriod(ApiModel):
    period: str
    domains: list[ParentProgressDomain]


class AuditLogItem(ApiModel):
    id: PositiveId
    action: str
    performed_by: str
    teacher_name: str
    details: str | None = None
    timestamp: datetime | None = None

    @computed_field
    @property
    def log_id(self) -> int:
        return self.id

    @computed_field
    @property
    def action_type(self) -> str:
        return self.action


class AnalyticsStats(ApiModel):
    stats: dict[str, str]
    functionalMastery: dict[str, int] | None = None
    messages: list['RecentMessage'] | None = None
    allow_eccd_question_management: bool | None = None


class RecentMessage(ApiModel):
    id: PositiveId
    name: str | None = None
    preview: str
    time: str
    read: bool

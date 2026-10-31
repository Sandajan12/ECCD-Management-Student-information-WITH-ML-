from datetime import date, datetime
from typing import Literal, Optional

from backend.models.eccd import EccdAnswer, TestingPeriod
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator
from .common import ApiModel, PositiveId
from .common import ParentPermissions
from .student import StudentPublicResponse
from .assessment_access import ParentAssessmentAccess


# --- DOMAIN SCHEMAS ---
class EccdDomainBase(BaseModel):
    domain_name: str = Field(min_length=1, max_length=100)


class EccdDomainResponse(EccdDomainBase):
    domain_id: int
    model_config = ConfigDict(from_attributes=True)


# --- QUESTION SCHEMAS ---
class EccdQuestionBase(BaseModel):
    domain_id: PositiveId
    question_text: str = Field(min_length=1)
    sequence_order: int = Field(ge=1)
    is_home_based: bool | None = False


class EccdQuestionResponse(EccdQuestionBase):
    question_id: PositiveId
    model_config = ConfigDict(from_attributes=True)


# --- EVALUATION SCHEMAS ---
class EvaluationProvenance(BaseModel):
    parent_id: Optional[int] = None
    evaluator_role: Literal["teacher", "parent"] = "teacher"
    teacher_evaluation_date: Optional[date] = None
    parent_submitted_at: Optional[datetime] = None


class EvaluationBase(BaseModel):
    teacher_id: PositiveId | None = None
    question_id: PositiveId
    testing_period: TestingPeriod
    answer: EccdAnswer
    evaluation_date: date


class EvaluationCreate(EvaluationBase):
    student_lrn: str


class EvaluationUpdate(BaseModel):
    answer: EccdAnswer | None = None
    evaluation_date: date | None = None


class EvaluationResponse(EvaluationBase, EvaluationProvenance):
    evaluation_id: int
    student_lrn: str
    model_config = ConfigDict(from_attributes=True)


class EvaluationIdCreate(EvaluationBase):
    student_id: PositiveId


class EvaluationIdResponse(EvaluationIdCreate, EvaluationProvenance):
    evaluation_id: PositiveId
    model_config = ConfigDict(from_attributes=True)


StudentEccdEvaluationResponse = EvaluationIdResponse


class AssessmentAnswer(ApiModel):
    question_id: PositiveId
    testing_period: TestingPeriod
    answer: EccdAnswer


class AssessmentSaveRequest(ApiModel):
    student_id: PositiveId
    testing_period: TestingPeriod
    assessment_date: date
    evaluations: list[AssessmentAnswer] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_answers(self) -> "AssessmentSaveRequest":
        ids = [answer.question_id for answer in self.evaluations]
        if len(ids) != len(set(ids)):
            raise ValueError("Each question may occur only once per assessment")
        if any(answer.testing_period != self.testing_period for answer in self.evaluations):
            raise ValueError("All answers must use the requested testing period")
        return self


class EvaluationBatch(ApiModel):
    student_lrn: str | int = Field(validation_alias=AliasChoices("student_id", "student_lrn"))
    testing_period: TestingPeriod = Field(validation_alias=AliasChoices("testing_period", "period"))
    assessment_date: date = Field(default_factory=date.today, validation_alias=AliasChoices("assessment_date", "evaluation_date"))
    evaluations: list[AssessmentAnswer] = Field(default_factory=list, max_length=1000)

    @model_validator(mode="before")
    @classmethod
    def normalize_answers(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        data = dict(value)
        period = data.get("testing_period", data.get("period"))
        answers = data.get("answers")
        if "evaluations" not in data and isinstance(answers, dict):
            data["evaluations"] = [{"question_id": key, "answer": answer} for key, answer in answers.items()]
        if isinstance(data.get("evaluations"), list):
            rows = []
            for row in data["evaluations"]:
                if not isinstance(row, dict):
                    rows.append(row)
                    continue
                answer = row.get("answer")
                if not isinstance(answer, bool) and answer in (0, 1):
                    answer = "KAYA" if answer == 1 else "DI-KAYA"
                rows.append({**row, "answer": answer, "testing_period": row.get("testing_period", period)})
            data["evaluations"] = rows
        return data

    @model_validator(mode="after")
    def consistent_batch(self) -> "EvaluationBatch":
        keys = [row.question_id for row in self.evaluations]
        if len(keys) != len(set(keys)) or any(row.testing_period != self.testing_period for row in self.evaluations):
            raise ValueError("Assessment questions must be unique and use the selected period")
        return self


class ParentEvaluationBatch(ApiModel):
    student_lrn: str | int = Field(validation_alias=AliasChoices("student_id", "student_lrn"))
    testing_period: TestingPeriod | None = None
    evaluations: list[AssessmentAnswer] = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def unique_answers(self) -> "ParentEvaluationBatch":
        periods = {row.testing_period for row in self.evaluations}
        if len(periods) != 1 or (self.testing_period is not None and periods != {self.testing_period}):
            raise ValueError("Submit home-based answers for the selected testing period only")
        # Older durable requests already contain one period per domain draft.
        # Infer that period so queued pre-Phase-4 observations can still sync.
        self.testing_period = self.evaluations[0].testing_period
        keys = [(row.question_id, row.testing_period) for row in self.evaluations]
        if len(keys) != len(set(keys)):
            raise ValueError("Duplicate home-based assessment answers")
        return self


class ParentEvaluationSaved(ApiModel):
    message: str
    testing_period: TestingPeriod


class EvaluationSaved(ApiModel):
    message: str
    period: TestingPeriod
    evaluation_date: date
    student_id: PositiveId


class ChecklistQuestion(ApiModel):
    question_id: PositiveId
    question_text: str
    sequence_order: int
    domain_id: PositiveId | None = None
    domain_name: str | None = None
    is_home_based: bool
    evaluator_roles: dict[TestingPeriod, Literal["teacher", "parent"] | None]
    answers: dict[TestingPeriod, EccdAnswer | None]


class ChecklistDomain(ApiModel):
    domain_id: PositiveId
    domain_name: str
    questions: list[ChecklistQuestion]


class ParentPeriodCard(ApiModel):
    period: TestingPeriod
    isReleased: bool
    isEvaluated: bool
    is_published: bool
    assessmentDate: date | None = None
    decimalAge: float | None = None
    standardScore: int | None = None
    interpretation: str | None = None
    rawScores: dict[str, int] | None = None
    scaledScores: dict[str, int] | None = None
    sumOfScaledScores: int | None = None


class MatrixDomain(ApiModel):
    domain_id: PositiveId
    domain_code: str
    domain_name: str
    scores: dict[TestingPeriod, int | None]


class AssessmentResponse(ApiModel):
    student_id: PositiveId
    masked_lrn: str
    domains: list[ChecklistDomain]
    evalAges: dict[str, dict[TestingPeriod, float | None]]
    periodDates: dict[TestingPeriod, date | None]
    evaluationDates: dict[TestingPeriod, date | None]
    gradingDates: dict[TestingPeriod, date | None] = Field(default_factory=dict)
    student_birth_date: date | None = None


class TeacherAssessmentResponse(AssessmentResponse):
    pre_kaya_question_ids: list[PositiveId] = Field(default_factory=list)


class EccdCardPreviewResponse(ApiModel):
    student_id: PositiveId
    html: str


class ParentAssessmentResponse(AssessmentResponse):
    allow_parent_view_eccd_marks: bool = False
    parent_assessment_access: ParentAssessmentAccess
    student: StudentPublicResponse
    permissions: ParentPermissions
    summary: dict[TestingPeriod, ParentPeriodCard]
    matrix: list[MatrixDomain]
    homeBasedChecklist: list[ChecklistQuestion]
    can_edit_home_based: bool


class ParentDomainCard(ApiModel):
    domain_id: PositiveId
    domain_name: str
    scoreText: str
    progress: int | None
    statusText: str
    statusColor: str
    isExcelling: bool
    needsSupport: bool


class ParentDashboardResponse(ApiModel):
    currentPhase: str
    latestPhase: str | None
    excelsIn: str
    needsSupportIn: str
    assessmentMastered: bool
    totalKaya: int | None
    totalDiKaya: int | None
    is_published: bool
    interpretation: str | None = None
    overallStatus: str
    overallStatusColor: str
    domainCards: list[ParentDomainCard]


class DomainProgress(ApiModel):
    domain_id: PositiveId
    domain_name: str
    pre_progress: int | None
    mid_progress: int | None
    post_progress: int | None
    questions: list[EccdQuestionResponse] = Field(default_factory=list)


class EvaluationPublicResponse(EvaluationBase, EvaluationProvenance):
    evaluation_id: PositiveId
    student_id: PositiveId
    model_config = ConfigDict(from_attributes=True)

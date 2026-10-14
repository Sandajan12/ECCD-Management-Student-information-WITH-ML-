from datetime import date

from backend.models.eccd import EccdAnswer, TestingPeriod
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator
from .common import ApiModel, PositiveId
from .common import ParentPermissions
from .student import StudentPublicResponse


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


class EvaluationResponse(EvaluationBase):
    evaluation_id: int
    student_lrn: str
    model_config = ConfigDict(from_attributes=True)


class EvaluationIdCreate(EvaluationBase):
    student_id: PositiveId


class EvaluationIdResponse(EvaluationIdCreate):
    evaluation_id: PositiveId
    model_config = ConfigDict(from_attributes=True)


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
    evaluations: list[AssessmentAnswer] = Field(max_length=1000)

    @model_validator(mode="after")
    def unique_answers(self) -> "ParentEvaluationBatch":
        keys = [(row.question_id, row.testing_period) for row in self.evaluations]
        if len(keys) != len(set(keys)):
            raise ValueError("Duplicate home-based assessment answers")
        return self


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
    student_birth_date: date | None = None


class ParentAssessmentResponse(AssessmentResponse):
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


class EvaluationPublicResponse(EvaluationBase):
    evaluation_id: PositiveId
    student_id: PositiveId
    model_config = ConfigDict(from_attributes=True)

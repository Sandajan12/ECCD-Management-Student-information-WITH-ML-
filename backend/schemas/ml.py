"""Public teacher and privacy-scoped parent educational research contracts."""
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

ScaledScore = Annotated[int, Field(ge=0, le=19)]
Education = Literal["Elementary", "High School", "Vocational", "College"]
Occupation = Literal["Unemployed", "Informal_Daily_Wage", "Skilled_Regular", "Professional"]


class MLFeatures(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    pre_standard_score: Annotated[int, Field(ge=0, le=200)]
    pre_total_scaled: Annotated[int, Field(ge=0, le=133)]
    pre_delayed_domains_count: Annotated[int, Field(ge=0, le=7)]
    gm_pre_scaled: ScaledScore
    fm_pre_scaled: ScaledScore
    sh_pre_scaled: ScaledScore
    rl_pre_scaled: ScaledScore
    el_pre_scaled: ScaledScore
    cog_pre_scaled: ScaledScore
    se_pre_scaled: ScaledScore
    age_months_pre: Annotated[int, Field(ge=1, le=216)]
    gender: Literal["MALE", "FEMALE"] | None = None
    handedness: Literal["Left", "Right"] | None = None
    father_education_level: Education | None = None
    household_occupation_tier: Occupation | None = None
    mother_education_level: Education | None = None
    num_siblings: Annotated[int, Field(ge=0, le=30)] | None = None
    birth_order: Annotated[int, Field(ge=1, le=31)] | None = None


class SandboxRawScores(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    GM: Annotated[int, Field(ge=0, le=13)]
    FM: Annotated[int, Field(ge=0, le=11)]
    SH: Annotated[int, Field(ge=0, le=27)]
    RL: Annotated[int, Field(ge=0, le=5)]
    EL: Annotated[int, Field(ge=0, le=8)]
    C: Annotated[int, Field(ge=0, le=21)]
    SE: Annotated[int, Field(ge=0, le=24)]


class SandboxPredictionRequest(MLFeatures):
    # Public sandbox policy only; student/parent inference keeps MLFeatures.
    age_months_pre: Annotated[int, Field(strict=True, ge=36, le=71)]
    raw_scores: SandboxRawScores | None = None


class BaselineDomain(BaseModel):
    domain: str
    name: str
    pre_scaled_score: float
    tier: Literal["Delay", "Slight Delay", "Average"]


class Intervention(BaselineDomain):
    di_kaya_items: list[int]
    unmarked_items: list[int]
    trigger: list[str]
    goal: str
    curriculum_area: str
    practice: str
    scaffolding: str
    review_days: int
    classroom_activity: str
    home_activity: str
    success_check: str
    source_url: str


class ForecastResponse(BaseModel):
    prediction_status: Literal["available"]
    support_reason: None
    predicted_post_interpretation: str | None
    confidence_percentages: dict[str, float]
    confidence_percentage: float | None
    unsupported_classes: list[str]
    pre_interpretation: str | None


class PredictionResponse(ForecastResponse):
    student_id: int | None = None
    student_name: str | None = None
    assessment_date: date | None = None
    class_probabilities: dict[str, float]
    baseline_domains: list[BaselineDomain]
    features: MLFeatures
    imputed_fields: list[str]
    interventions: list[Intervention]
    interpretation_note: str
    research_notice: str


class MLStudentOption(BaseModel):
    student_id: int
    student_name: str
    pre_complete: bool
    readiness_note: str


class ParentMLReadiness(MLStudentOption):
    allow_parent_predictions: bool
    is_published: bool


class HomeIntervention(BaselineDomain):
    goal: str
    home_activity: str
    practice: str
    scaffolding: str
    review_days: int
    success_check: str
    source_url: str


class ParentPredictionResponse(ForecastResponse):
    """Parent projection excludes family model inputs and individual checklist marks."""
    student_id: int
    student_name: str
    assessment_date: date
    baseline_domains: list[BaselineDomain]
    interventions: list[HomeIntervention]
    interpretation_note: str
    research_notice: str


from typing import Literal

from pydantic import BaseModel, Field

DevelopmentalInterpretation = Literal[
    "Delay", "Slight Delay", "Average", "Slight Advance", "Highly Advance",
    # Accept display labels and retain previous query aliases for compatibility.
    "Slight Advancement", "Highly Advancement",
    "Average Development", "Significant Delay", "Advanced Development", "Delayed / Needs Support"
]


class PieChartSlice(BaseModel):
    name: str
    value: int
    color: str


class DashboardStats(BaseModel):
    total_teachers: int
    total_students: int
    total_sections: int


class DashboardSectionOption(BaseModel):
    section_id: int
    section_name: str


class DashboardFilters(BaseModel):
    sections: list[str]
    domains: list[str]
    schoolYears: list[str]
    sectionOptions: list[DashboardSectionOption] = Field(default_factory=list)
    currentSchoolYear: str | None = None


class ExcellingDomainSummary(BaseModel):
    domainName: str | None = None
    masteryRate: float | None = None
    totalKaya: int = 0
    totalItems: int = 0
    completedStudents: int = 0


class CriticalDomainSummary(BaseModel):
    domainName: str | None = None
    totalDiKaya: int = 0
    completedStudents: int = 0


class TeacherDomainSummary(BaseModel):
    domainId: int
    domainName: str
    totalKaya: int = Field(ge=0)
    totalDiKaya: int = Field(ge=0)
    totalItems: int = Field(gt=0)
    masteryRate: float = Field(ge=0, le=100)


class PriorityStudentSummary(BaseModel):
    studentId: int
    studentName: str
    totalDiKaya: int = Field(gt=0)


class TeacherPeriodInsights(BaseModel):
    period: Literal["PRE", "MID", "POST"]
    totalStudents: int = Field(default=0, ge=0)
    completedStudents: int = Field(default=0, ge=0)
    completionRate: float = Field(default=0, ge=0, le=100)
    domains: list[TeacherDomainSummary] = Field(default_factory=list)
    excellingDomain: TeacherDomainSummary | None = None
    criticalDomain: TeacherDomainSummary | None = None
    priorityStudent: PriorityStudentSummary | None = None


class DelayedStudentSummary(BaseModel):
    studentId: int
    studentName: str
    decimalAge: float
    # Preserve the official scoring-table label for every matching student.
    delayStatus: str


class SectionGenderCounts(BaseModel):
    male: int = 0
    female: int = 0


class DelaySummary(BaseModel):
    male: int = 0
    female: int = 0
    totalDelayed: int = Field(default=0, description="Matching students with official Slight Delay or Delay results.")
    totalMatched: int = Field(default=0, description="Students matching the selected interpretation, regardless of recorded gender.")
    assessedStudents: int = 0
    bySection: dict[str, SectionGenderCounts] = Field(default_factory=dict)
    students: list[DelayedStudentSummary] = Field(default_factory=list)

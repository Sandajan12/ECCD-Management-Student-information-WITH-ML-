
from pydantic import BaseModel, Field


class PieChartSlice(BaseModel):
    name: str
    value: int
    color: str


class DashboardStats(BaseModel):
    total_teachers: int
    total_students: int
    total_sections: int


class DashboardFilters(BaseModel):
    sections: list[str]
    domains: list[str]
    schoolYears: list[str]


class CriticalDomainSummary(BaseModel):
    domainName: str | None = None
    totalDiKaya: int = 0
    completedStudents: int = 0


class DelaySummary(BaseModel):
    male: int = 0
    female: int = 0
    totalDelayed: int = 0
    assessedStudents: int = 0
    bySection: dict[str, int] = Field(default_factory=dict)

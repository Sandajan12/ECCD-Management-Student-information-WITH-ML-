
from pydantic import BaseModel


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

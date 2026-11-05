"""Separate official school testing dates from dates used for live grading.

Callers must pass records for one student, across all of that student's domains.
Compatibility dates are a preview fallback only; they never confirm a school test.
"""
from collections.abc import Iterable, Mapping
from datetime import date, datetime, timedelta, timezone

from backend.models.eccd import StudentEccdEvaluation, TestingPeriod

EvaluationRecord = StudentEccdEvaluation | Mapping[str, object]
PHT = timezone(timedelta(hours=8))


def now_pht() -> datetime:
    return datetime.now(PHT)


def _field(record: EvaluationRecord, name: str) -> object:
    return record.get(name) if isinstance(record, Mapping) else getattr(record, name, None)


def _date_only(value: object) -> date | None:
    if isinstance(value, datetime):
        # PostgreSQL can return TIMESTAMPTZ in the session's time zone.
        return (value.astimezone(PHT) if value.tzinfo else value).date()
    if isinstance(value, date):
        return value
    return None


def get_official_testing_date(
    records: Iterable[EvaluationRecord], testing_period: TestingPeriod | str,
) -> date | None:
    """Return the earliest explicit teacher date, regardless of the last editor."""
    dates = (
        _date_only(_field(record, "teacher_evaluation_date"))
        for record in records if _field(record, "testing_period") == testing_period
    )
    return min((value for value in dates if value is not None), default=None)


def get_grading_date(
    records: Iterable[EvaluationRecord], testing_period: TestingPeriod | str,
) -> date | None:
    """Prefer the official date; otherwise use parent/compatibility preview dates.

    Prefer each observation's submission timestamp over its compatibility date.
    Historical rows without provenance can still be previewed, but cannot acquire
    an official date through this fallback.
    """
    period_records = [record for record in records if _field(record, "testing_period") == testing_period]
    official = get_official_testing_date(period_records, testing_period)
    if official is not None:
        return official
    dates = (
        _date_only(_field(record, "parent_submitted_at"))
        or _date_only(_field(record, "evaluation_date"))
        for record in period_records
    )
    return min((value for value in dates if value is not None), default=None)

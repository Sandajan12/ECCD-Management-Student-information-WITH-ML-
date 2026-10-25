"""Readable audit snapshots in the existing TEXT details column; no commits here."""
from pydantic import ValidationError
from sqlalchemy.orm import Session

from backend.models import Parent, SystemLog, Teacher, User
from backend.schemas.log import AuditDetails
from backend.utils.account_identity import account_display_name, email_display_name


def person_name(person: object, fallback: str = "Unknown person") -> str:
    return " ".join(str(value).strip() for field in ("first_name", "middle_name", "last_name")
                    if (value := getattr(person, field, None)) and str(value).strip()) or fallback


def teacher_name(teacher: Teacher) -> str:
    fallback = email_display_name(teacher.user.email) if teacher.user else "Unnamed teacher"
    return person_name(teacher, fallback)


def actor_name(db: Session, user: User) -> str:
    return account_display_name(user, db)


def record_audit(db: Session, user: User, action: str, summary: str, **metadata: str | int | None) -> None:
    details = AuditDetails(summary=summary, metadata=metadata)
    db.add(SystemLog(user_id=user.user_id, action_type=action, details=details.model_dump_json()))


def read_details(raw: str | None) -> tuple[str | None, dict[str, str | int | None] | None]:
    try:
        details = AuditDetails.model_validate_json(raw or "")
    except ValidationError:
        return raw, None
    return details.summary, details.metadata

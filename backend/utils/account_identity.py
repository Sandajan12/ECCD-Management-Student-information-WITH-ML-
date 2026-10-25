"""Resolve presentation names from profiles and school settings."""
from sqlalchemy.orm import Session, object_session

from backend.models import User, SystemSettings
from backend.models.user import UserRole


def email_display_name(email: str | None) -> str:
    return (email or "").partition("@")[0] or "User"


def chairman_name(db: Session | None) -> str:
    settings = db.get(SystemSettings, 1) if db is not None else None
    name = (settings.chairman_name or "").strip() if settings else ""
    return name or "Chairman"


def account_names(user: User, db: Session | None = None) -> dict[str, str]:
    first_name, last_name, full_name = "", "", ""
    if user.role == UserRole.ADMIN and user.teacher:
        first_name = (user.teacher.first_name or "").strip()
        last_name = (user.teacher.last_name or "").strip()
        full_name = " ".join(part for part in (first_name, last_name) if part)
    else:
        if user.role == UserRole.USER and user.parent:
            full_name = (user.parent.fullname or "").strip()
        elif user.role == UserRole.SUPER_ADMIN:
            full_name = chairman_name(db if db is not None else object_session(user))
        if full_name:
            if "," in full_name:
                last_name, first_name = (part.strip() for part in full_name.split(",", 1))
            else:
                parts = full_name.rsplit(None, 1)
                first_name, last_name = parts[0], parts[1] if len(parts) > 1 else ""
            full_name = " ".join(part for part in (first_name, last_name) if part)
    return {"first_name": first_name, "last_name": last_name, "full_name": full_name}


def account_display_name(user: User, db: Session | None = None) -> str:
    return account_names(user, db)["full_name"] or email_display_name(user.email)

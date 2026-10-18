"""Shared section authorization and window serialization."""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from backend.models import Section, SectionTeacher, User
from backend.schemas.assessment_access import ParentAssessmentAccess
from backend.utils.access import current_teacher

PERIOD_FLAGS = {
    "PRE": "pre_test_parent_editable",
    "MID": "mid_test_parent_editable",
    "POST": "post_test_parent_editable",
}
PERIOD_LABELS = {"PRE": "Pre-Test", "MID": "Mid-Test", "POST": "Post-Test"}


def teacher_access_section(db: Session, user: User, section_id: int | None) -> Section:
    teacher = current_teacher(db, user)
    assignments = db.query(SectionTeacher).filter_by(teacher_id=teacher.teacher_id, role="Primary Adviser", status="Active")
    if section_id is None:
        ids = {row.section_id for row in assignments}
        if len(ids) != 1:
            raise HTTPException(400, "Select an active assigned section.")
        section_id = ids.pop()
    # Lock the section before rechecking authorization, serializing handovers,
    # settings changes and parent writes against the same section row.
    section = db.query(Section).filter_by(section_id=section_id).with_for_update().first()
    if section is None or assignments.filter_by(section_id=section_id).first() is None:
        raise HTTPException(403, "Section is not actively assigned to your account.")
    return section


def window_values(section: Section | None) -> dict[str, bool]:
    return {key: bool(getattr(section, key, False)) for key in ParentAssessmentAccess.model_fields}

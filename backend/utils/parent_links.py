"""Account link details; guardian-only records never represent account access."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models import FamilyAccess, Parent, User


def account_links(db: Session, student_ids: list[int]) -> dict[int, list[tuple]]:
    result: dict[int, list[tuple]] = {}
    if not student_ids:
        return result
    rows = db.query(FamilyAccess, Parent, User).join(Parent, FamilyAccess.parent_id == Parent.parent_id).join(User, Parent.user_id == User.user_id).filter(FamilyAccess.student_id.in_(student_ids)).order_by(FamilyAccess.date_linked, FamilyAccess.id).all()
    for link, parent, user in rows:
        result.setdefault(link.student_id, []).append((link, parent, user))
    return result


def link_details(rows: list[tuple]) -> dict:
    if not rows:
        return {"parent_link_status": "NONE", "parent_info": None}
    # Historical multiple account links are displayed one at a time and never
    # silently removed by an action targeting a different account.
    link, parent, user = rows[0]
    return {"parent_link_status": link.status, "parent_info": {
        "parent_id": parent.parent_id, "full_name": parent.fullname or user.username,
        "email": user.email, "relationship": link.relationship_type or "Guardian",
        "linked_at": link.date_linked if link.status == "SYNCED" else None,
        "requested_at": link.requested_at,
    }}


def selected_link(db: Session, student_id: int, parent_id: int | None, expected: str) -> tuple:
    rows = account_links(db, [student_id]).get(student_id, [])
    matches = [row for row in rows if row[0].status == expected and (parent_id is None or row[1].parent_id == parent_id)]
    if not matches:
        raise HTTPException(409, "The parent link has changed. Refresh the student list and try again.")
    if parent_id is None and len(matches) != 1:
        raise HTTPException(409, "Select the parent account to manage.")
    return matches[0]

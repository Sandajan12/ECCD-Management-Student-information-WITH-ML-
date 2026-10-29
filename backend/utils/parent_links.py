"""Account link details; guardian-only records never represent account access."""
from fastapi import HTTPException
from sqlalchemy.orm import Session, contains_eager

from backend.models import FamilyAccess, Parent, Student, SystemLog, User
from backend.utils.account_identity import account_display_name
from backend.utils.audit import person_name, read_details


ACCOUNT_LINK_EVENTS = ("Linked Parent", "Requested Parent Link", "Approved Parent Link", "Unlinked Parent", "Rejected Parent Link")


def has_account_link_history(db: Session, student: Student) -> bool:
    """Check student-wide account history; school-entered guardians do not count.

    Call while holding the student row lock. Current unlink/reject actions delete
    the link but retain ID-bearing audit events in the same transaction.
    """
    if db.query(FamilyAccess.id).join(Parent).filter(
        FamilyAccess.student_id == student.student_id, Parent.user_id.isnot(None)
    ).first() is not None:
        return True
    name = person_name(student)
    events = db.query(SystemLog.details).filter(SystemLog.action_type.in_(ACCOUNT_LINK_EVENTS)).yield_per(200)
    for (raw,) in events:
        summary, metadata = read_details(raw)
        if metadata is not None:
            # Never fall back to a name when a structured event identifies a
            # different student, including students with identical names.
            if str(metadata.get("studentId")) == str(student.student_id):
                return True
        elif summary and summary.startswith("Unlinked Parent: ") and summary.endswith(f" from student {name}"):
            # Old logs did not store IDs. Exact name matches conservatively
            # require approval for every namesake; substrings never match.
            return True
    return False


def account_links(db: Session, student_ids: list[int]) -> dict[int, list[tuple]]:
    result: dict[int, list[tuple]] = {}
    if not student_ids:
        return result
    rows = db.query(FamilyAccess, Parent, User).join(Parent, FamilyAccess.parent_id == Parent.parent_id).join(User, Parent.user_id == User.user_id).options(contains_eager(User.parent)).filter(FamilyAccess.student_id.in_(student_ids)).order_by(FamilyAccess.date_linked, FamilyAccess.id).all()
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
        "parent_id": parent.parent_id, "full_name": account_display_name(user),
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

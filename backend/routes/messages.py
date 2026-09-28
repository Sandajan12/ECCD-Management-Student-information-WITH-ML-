
from backend.config.database import get_db
from backend.models.message import Message, SenderRole
from backend.models.parent import FamilyAccess, Parent
from backend.models.section import Section
from backend.models.student import Student
from backend.models.teacher import Teacher
from backend.models.user import User, UserRole
from backend.schemas.message import MessageCreate, MessageResponse
from backend.utils.deps import verify_role
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/messages", tags=["Messages"])


from backend.models.section_teacher import SectionTeacher


@router.get("/contacts")
def get_contacts(
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["admin", "teacher", "user", "parent"])),
):
    if current_user.role in [UserRole.ADMIN, "teacher"]:
        teacher = (
            db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
        )
        if not teacher:
            return {"myId": None, "contacts": []}

        # Find teacher's active section IDs
        st_sec_ids = [
            st.section_id
            for st in db.query(SectionTeacher.section_id)
            .filter(SectionTeacher.teacher_id == teacher.teacher_id, SectionTeacher.status == "Active")
            .all()
        ]
        s_sec_ids = [
            s.section_id
            for s in db.query(Section.section_id)
            .filter(Section.adviser_teacher_id == teacher.teacher_id)
            .all()
        ]
        sec_ids = list(set(st_sec_ids + s_sec_ids))

        if not sec_ids:
            return {"myId": teacher.teacher_id, "contacts": []}

        # Teachers see parents of students in their section
        query = (
            db.query(Parent, Student)
            .join(FamilyAccess, Parent.parent_id == FamilyAccess.parent_id)
            .join(Student, FamilyAccess.student_lrn == Student.lrn_number)
            .filter(
                Student.section_id.in_(sec_ids),
                Student.is_active == True,
                Parent.user_id.isnot(None),  # Only parents with actual login accounts
            )
            .all()
        )

        contacts_map = {}
        for parent, student in query:
            if parent.parent_id not in contacts_map:
                contacts_map[parent.parent_id] = {
                    "id": parent.parent_id,
                    "name": f"{parent.fullname or parent.user.username} ({student.first_name}'s Parent)",
                    "latest_message_time": None,
                }
            else:
                if f"{student.first_name}'s Parent" not in contacts_map[parent.parent_id]["name"]:
                    contacts_map[parent.parent_id]["name"] = contacts_map[
                        parent.parent_id
                    ]["name"].replace(
                        "'s Parent)", f" & {student.first_name}'s Parent)"
                    )

        contacts = list(contacts_map.values())
        return {"myId": teacher.teacher_id, "contacts": contacts}

    else:
        # Parents see teachers of their linked children
        parent = db.query(Parent).filter(Parent.user_id == current_user.user_id).first()
        if not parent:
            return {"myId": None, "contacts": []}

        # Find linked students' section IDs
        linked_sec_ids = [
            s.section_id
            for s in db.query(Student.section_id)
            .join(FamilyAccess, Student.lrn_number == FamilyAccess.student_lrn)
            .filter(
                FamilyAccess.parent_id == parent.parent_id,
                Student.is_active == True,
                Student.section_id.isnot(None),
            )
            .all()
        ]

        if not linked_sec_ids:
            return {"myId": parent.parent_id, "contacts": []}

        # Query teachers assigned to those sections
        active_teachers = (
            db.query(Teacher)
            .join(SectionTeacher, Teacher.teacher_id == SectionTeacher.teacher_id)
            .filter(
                SectionTeacher.section_id.in_(linked_sec_ids),
                SectionTeacher.status == "Active",
            )
            .all()
        )
        legacy_teachers = (
            db.query(Teacher)
            .join(Section, Teacher.teacher_id == Section.adviser_teacher_id)
            .filter(Section.section_id.in_(linked_sec_ids))
            .all()
        )

        contacts = []
        seen = set()
        for teacher in active_teachers + legacy_teachers:
            if teacher.teacher_id not in seen:
                seen.add(teacher.teacher_id)
                contacts.append(
                    {
                        "id": teacher.teacher_id,
                        "name": f"Teacher {teacher.first_name} {teacher.last_name}",
                    }
                )

        return {"myId": parent.parent_id, "contacts": contacts}


@router.get("/history", response_model=list[MessageResponse])
def get_chat_history(
    teacher_id: int = Query(...),
    parent_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["admin", "teacher", "user", "parent"])),
):
    messages = (
        db.query(Message)
        .filter(
            Message.teacher_id == teacher_id,
            Message.parent_id == parent_id,
            Message.is_archived == False,
        )
        .order_by(Message.created_at.asc())
        .all()
    )

    return messages


@router.post("/", status_code=201)
@router.post("/send", status_code=201)
def send_message(
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["admin", "teacher", "user", "parent"])),
):
    content = payload.content
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    new_message = Message(
        teacher_id=payload.teacher_id,
        parent_id=payload.parent_id,
        sender_role=payload.sender_role,
        subject=payload.subject,
        body=content,
    )
    db.add(new_message)
    db.commit()
    return {"message": "Message sent!"}


@router.get("/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["admin", "teacher", "user", "parent"])),
):
    if current_user.role in [UserRole.ADMIN, "teacher"]:
        teacher = (
            db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
        )
        if not teacher:
            return {"unreadCount": 0}

        count = (
            db.query(Message)
            .filter(
                Message.teacher_id == teacher.teacher_id,
                Message.sender_role == SenderRole.PARENT,
                Message.is_read == False,
                Message.is_archived == False,
            )
            .count()
        )
        return {"unreadCount": count}

    else:
        parent = db.query(Parent).filter(Parent.user_id == current_user.user_id).first()
        if not parent:
            return {"unreadCount": 0}

        count = (
            db.query(Message)
            .filter(
                Message.parent_id == parent.parent_id,
                Message.sender_role == SenderRole.TEACHER,
                Message.is_read == False,
                Message.is_archived == False,
            )
            .count()
        )
        return {"unreadCount": count}


from pydantic import BaseModel, ConfigDict


class MarkReadPayload(BaseModel):
    teacher_id: int
    parent_id: int
    model_config = ConfigDict(extra="ignore")


@router.put("/read")
@router.put("/mark-read")
def mark_as_read(
    payload: MarkReadPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_role(["admin", "teacher", "user", "parent"])),
):
    sender_role_to_mark = (
        SenderRole.PARENT
        if current_user.role in [UserRole.ADMIN, "teacher"]
        else SenderRole.TEACHER
    )

    messages = (
        db.query(Message)
        .filter(
            Message.teacher_id == payload.teacher_id,
            Message.parent_id == payload.parent_id,
            Message.sender_role == sender_role_to_mark,
            Message.is_read == False,
        )
        .all()
    )

    for msg in messages:
        msg.is_read = True

    db.commit()
    return {"success": True}

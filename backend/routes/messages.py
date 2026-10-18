from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func
from backend.config.database import get_db
from backend.models import FamilyAccess, Message, Parent, SectionTeacher, Student, Teacher, User
from backend.models.message import SenderRole
from backend.schemas.message import ContactsResponse, ConversationRequest, MessageCreate, MessageResponse, NotifyStudentRequest, NotifyStudentResponse, PersistedMessageResponse, SuccessResponse, UnreadResponse
from backend.utils.access import authorize_student, current_teacher, resolve_student, teacher_sections
from backend.utils.deps import verify_role
from backend.utils.messaging import authorize_conversation

router = APIRouter(prefix="/api/messages", tags=["Messages"])


@router.get("/contacts", response_model=ContactsResponse)
def contacts(db: Session = Depends(get_db), user: User = Depends(verify_role(["admin", "user"]))):
    result = []
    if user.role.value == "admin":
        teacher = current_teacher(db, user)
        parents = db.query(Parent).join(FamilyAccess).join(Student).join(User, Parent.user_id == User.user_id).filter(FamilyAccess.status == "SYNCED", Student.section_id.in_(teacher_sections(db, teacher)), Student.is_active.is_(True), User.is_active.is_(True), User.role == "user").distinct().all()
        for parent in parents:
            children = db.query(Student).join(FamilyAccess).filter(FamilyAccess.status == "SYNCED", FamilyAccess.parent_id == parent.parent_id, Student.section_id.in_(teacher_sections(db, teacher)), Student.is_active.is_(True)).distinct().all()
            names = " & ".join(sorted({child.first_name for child in children if child.first_name}))
            name = parent.fullname or parent.user.username
            latest = db.query(func.max(Message.created_at)).filter_by(parent_id=parent.parent_id, teacher_id=teacher.teacher_id, is_archived=False).scalar()
            result.append({"id": parent.parent_id, "name": f"{name} ({names}'s Parent)" if names else name, "latest_message_time": latest})
        own_id = teacher.teacher_id
    else:
        parent = db.query(Parent).filter_by(user_id=user.user_id).first()
        if parent is None:
            return {"myId": None, "contacts": []}
        own_id = parent.parent_id
        for teacher in db.query(Teacher).join(User).filter(User.is_active.is_(True)).all():
            try:
                authorize_conversation(db, user, teacher.teacher_id, parent.parent_id)
                latest = db.query(func.max(Message.created_at)).filter_by(parent_id=parent.parent_id, teacher_id=teacher.teacher_id, is_archived=False).scalar()
                result.append({"id": teacher.teacher_id, "name": f"Teacher {teacher.first_name or ''} {teacher.last_name or ''}".strip(), "latest_message_time": latest})
            except HTTPException:
                continue
    result.sort(key=lambda item: (-(item["latest_message_time"].timestamp()) if item["latest_message_time"] else float('inf'), item["name"]))
    return {"myId": own_id, "contacts": result}


@router.get("/history", response_model=list[MessageResponse])
def history(teacher_id: int = Query(..., gt=0), parent_id: int = Query(..., gt=0), db: Session = Depends(get_db), user: User = Depends(verify_role(["admin", "user", "super-admin"]))):
    authorize_conversation(db, user, teacher_id, parent_id, read_only=True)
    return db.query(Message).filter_by(teacher_id=teacher_id, parent_id=parent_id, is_archived=False).order_by(Message.created_at, Message.message_id).all()


@router.post("/", response_model=PersistedMessageResponse, status_code=201)
@router.post("/send", response_model=PersistedMessageResponse, status_code=201)
def send(payload: MessageCreate, db: Session = Depends(get_db), user: User = Depends(verify_role(["admin", "user"]))):
    authorize_conversation(db, user, payload.teacher_id, payload.parent_id)
    role = SenderRole.TEACHER if user.role.value == "admin" else SenderRole.PARENT
    if payload.sender_role is not None and payload.sender_role != role:
        raise HTTPException(403, "Sender role does not match your account.")
    if not payload.content or len(payload.content) > 5000:
        raise HTTPException(400, "Messages must contain between 1 and 5000 characters.")
    record = Message(teacher_id=payload.teacher_id, parent_id=payload.parent_id, sender_role=role, subject=payload.subject, body=payload.content)
    db.add(record)
    db.commit()
    db.refresh(record)
    return PersistedMessageResponse.model_validate(record)


@router.post("/notify-student", response_model=NotifyStudentResponse, status_code=201)
def notify(payload: NotifyStudentRequest, db: Session = Depends(get_db), user: User = Depends(verify_role(["admin"]))):
    student = resolve_student(db, payload.student_id)
    authorize_student(db, user, student)
    if not student.is_active:
        raise HTTPException(403, "Student is archived.")
    teacher = current_teacher(db, user)
    parents = db.query(Parent).join(FamilyAccess).join(User, Parent.user_id == User.user_id).filter(FamilyAccess.status == "SYNCED", FamilyAccess.student_id == student.student_id, User.is_active.is_(True), User.role == "user").distinct().all()
    if not parents:
        raise HTTPException(404, "No active parent account is linked to this student.")
    for parent in parents:
        db.add(Message(teacher_id=teacher.teacher_id, parent_id=parent.parent_id, sender_role=SenderRole.TEACHER, body=f"The official profile for {student.first_name} has been updated. Please review the changes in Child Information."))
    db.commit()
    return {"message": "Profile notification sent to linked parents.", "recipients": len(parents)}


@router.get("/unread-count", response_model=UnreadResponse)
@router.get("/unread", response_model=UnreadResponse)
def unread(db: Session = Depends(get_db), user: User = Depends(verify_role(["admin", "user"]))):
    teacher_user, parent_user = aliased(User), aliased(User)
    # EXISTS avoids multiplying messages when siblings or duplicate assignment
    # records connect the same teacher and parent. No message bodies are loaded.
    relationship = db.query(Student.student_id).join(FamilyAccess, FamilyAccess.student_id == Student.student_id).join(SectionTeacher, SectionTeacher.section_id == Student.section_id).filter(
        FamilyAccess.status == "SYNCED",
        FamilyAccess.parent_id == Message.parent_id,
        SectionTeacher.teacher_id == Message.teacher_id,
        SectionTeacher.status == "Active",
        SectionTeacher.role == "Primary Adviser",
        Student.is_active.is_(True),
    ).correlate(Message).exists()
    query = db.query(func.count(Message.message_id)).select_from(Message).join(Teacher, Teacher.teacher_id == Message.teacher_id).join(Parent, Parent.parent_id == Message.parent_id).join(teacher_user, teacher_user.user_id == Teacher.user_id).join(parent_user, parent_user.user_id == Parent.user_id).filter(
        Message.is_read.is_(False), Message.is_archived.is_(False),
        teacher_user.is_active.is_(True), teacher_user.role == "admin",
        parent_user.is_active.is_(True), parent_user.role == "user",
        relationship,
    )
    if user.role.value == "admin":
        query = query.filter(Teacher.user_id == user.user_id, Message.sender_role == SenderRole.PARENT)
    else:
        query = query.filter(Parent.user_id == user.user_id, Message.sender_role == SenderRole.TEACHER)
    return {"unreadCount": query.scalar() or 0}


@router.put("/read", response_model=SuccessResponse)
@router.put("/mark-read", response_model=SuccessResponse)
def mark_read(payload: ConversationRequest, db: Session = Depends(get_db), user: User = Depends(verify_role(["admin", "user"]))):
    authorize_conversation(db, user, payload.teacher_id, payload.parent_id)
    sender = SenderRole.PARENT if user.role.value == "admin" else SenderRole.TEACHER
    db.query(Message).filter_by(teacher_id=payload.teacher_id, parent_id=payload.parent_id, sender_role=sender, is_archived=False).update({"is_read": True})
    db.commit()
    return {"success": True}

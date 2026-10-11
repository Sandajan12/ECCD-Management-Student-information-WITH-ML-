"""Exact rollover snapshots and a 30-day, transactionally reversible archive."""
from datetime import datetime, timedelta, timezone
import math
from uuid import uuid4
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session
from backend.models import Message, Student, SystemLog, SystemSettings, User
from backend.schemas.settings import RolloverRecordChunk, RolloverRequest, RolloverSnapshot


def settings_record(db: Session) -> SystemSettings:
    record = db.query(SystemSettings).filter_by(id=1).with_for_update().first()
    if record is None:
        record = SystemSettings(id=1)
        db.add(record)
        db.flush()
    return record


def undo_availability(setting: SystemSettings) -> dict:
    expires = None
    if setting.last_rollover_timestamp and setting.previous_school_year:
        try:
            timestamp = datetime.fromisoformat(setting.last_rollover_timestamp)
            timestamp = timestamp.replace(tzinfo=timezone.utc) if timestamp.tzinfo is None else timestamp
            expires = timestamp + timedelta(days=30)
        except ValueError:
            pass
    remaining = (expires - datetime.now(timezone.utc)).total_seconds() if expires else -1
    return {"canRevertSchoolYear": remaining >= 0, "daysRemaining": max(0, min(30, math.ceil(remaining / 86400))), "previousSchoolYear": setting.previous_school_year}


def rollover(db: Session, user: User, payload: RolloverRequest) -> dict:
    setting = settings_record(db)
    year = setting.current_school_year
    try:
        first, last = map(int, year.split("-"))
        snapshot = RolloverSnapshot(batch=uuid4(), previousYear=year, nextYear=f"{first + 1}-{last + 1}", startMonth=setting.school_year_start_month)
    except (ValueError, AttributeError, ValidationError):
        raise HTTPException(409, "Current school year is invalid; correct settings before rollover.") from None
    students = db.query(Student).filter(Student.is_active.is_(True)).with_for_update().all()
    messages = db.query(Message).filter(Message.is_archived.is_(False)).with_for_update().all()
    db.add(SystemLog(user_id=user.user_id, action_type="ROLLOVER_SNAPSHOT", details=snapshot.model_dump_json()))
    for kind, ids in (("students", [student.student_id for student in students]), ("messages", [message.message_id for message in messages])):
        for offset in range(0, len(ids), 500):
            chunk = RolloverRecordChunk(batch=snapshot.batch, kind=kind, ids=ids[offset:offset + 500])
            db.add(SystemLog(user_id=user.user_id, action_type="ROLLOVER_RECORDS", details=chunk.model_dump_json()))
    for student in students:
        student.is_active = False
    for message in messages:
        message.is_archived = True
    setting.previous_school_year, setting.current_school_year = year, snapshot.nextYear
    setting.school_year_start_month = payload.school_year_start_month or setting.school_year_start_month
    setting.last_rollover_timestamp = datetime.now(timezone.utc).isoformat()
    db.add(SystemLog(user_id=user.user_id, action_type="ROLLOVER_SCHOOL_YEAR", details=f"Rolled over to {setting.current_school_year}; opening month {setting.school_year_start_month}."))
    db.commit()
    return {"message": "System successfully rolled over to the next school year.", "next_school_year": setting.current_school_year, "school_year_start_month": setting.school_year_start_month}


def undo_rollover(db: Session, user: User) -> dict:
    setting = settings_record(db)
    if not setting.previous_school_year or not setting.last_rollover_timestamp:
        raise HTTPException(400, "No rollover history found to undo.")
    if not undo_availability(setting)["canRevertSchoolYear"]:
        raise HTTPException(400, "The 30-day undo window has expired.")
    log = db.query(SystemLog).filter_by(action_type="ROLLOVER_SNAPSHOT").order_by(SystemLog.log_id.desc()).first()
    try:
        snapshot = RolloverSnapshot.model_validate_json(log.details if log else "")
        if snapshot.previousYear != setting.previous_school_year or snapshot.nextYear != setting.current_school_year:
            raise ValueError()
        records = {"students": [], "messages": []}
        matching_batch = f'%"batch":"{snapshot.batch}"%'
        for entry in db.query(SystemLog).filter(SystemLog.action_type == "ROLLOVER_RECORDS", SystemLog.details.like(matching_batch)).order_by(SystemLog.log_id):
            chunk = RolloverRecordChunk.model_validate_json(entry.details)
            if chunk.batch == snapshot.batch:
                records[chunk.kind].extend(chunk.ids)
    except (ValidationError, ValueError, TypeError):
        raise HTTPException(409, "This rollover has no verified record snapshot. Restore a reviewed backup instead.") from None
    if records["students"]:
        db.query(Student).filter(Student.student_id.in_(records["students"])).update({Student.is_active: True}, synchronize_session=False)
    if records["messages"]:
        db.query(Message).filter(Message.message_id.in_(records["messages"])).update({Message.is_archived: False}, synchronize_session=False)
    setting.current_school_year, setting.school_year_start_month = snapshot.previousYear, snapshot.startMonth
    setting.previous_school_year, setting.last_rollover_timestamp = None, None
    db.add(SystemLog(user_id=user.user_id, action_type="REVERT_SCHOOL_YEAR", details=f"Reverted to {setting.current_school_year}."))
    db.commit()
    return {"success": True, "message": "Rollover successfully undone. System restored to the previous school year.", "restored_school_year": setting.current_school_year, "school_year_start_month": setting.school_year_start_month}

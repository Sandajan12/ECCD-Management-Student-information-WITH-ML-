"""Socket.IO transports persisted messages; the database remains authoritative."""
import re
import socketio
from fastapi import HTTPException
from pydantic import ValidationError
from backend.config.database import SessionLocal
from backend.models import Message
from backend.models.message import SenderRole
from backend.schemas.message import MessageResponse, SocketMessageRequest
from backend.utils.authentication import session_user
from backend.utils.messaging import authorize_conversation

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=["http://localhost:5173", "http://127.0.0.1:5173"])
connections: dict[str, str] = {}
generations: dict[str, int] = {}


def parse_room(room: object) -> tuple[int, int]:
    match = re.fullmatch(r"teacher-([1-9][0-9]*)-parent-([1-9][0-9]*)", room) if isinstance(room, str) else None
    if not match or any(int(value) > 2147483647 for value in match.groups()):
        raise HTTPException(400, "Invalid conversation room.")
    return int(match[1]), int(match[2])


@sio.event
async def connect(sid, environ, auth):
    token = auth.get("token") if isinstance(auth, dict) else None
    if not isinstance(token, str):
        return False
    try:
        with SessionLocal() as db:
            user = session_user(db, token)
            if user.role.value not in ("admin", "user"):
                return False
        connections[sid] = token
        return True
    except HTTPException:
        return False


@sio.event
async def disconnect(sid, reason=None):
    connections.pop(sid, None)
    generations.pop(sid, None)


async def failed(sid, message):
    result = {"success": False, "message": message}
    await sio.emit("chat_error", result, to=sid)
    return result


@sio.event
async def join_room(sid, room):
    generation = generations[sid] = generations.get(sid, 0) + 1
    try:
        teacher_id, parent_id = parse_room(room)
        with SessionLocal() as db:
            user = session_user(db, connections.get(sid, ""))
            authorize_conversation(db, user, teacher_id, parent_id)
        for previous in list(sio.rooms(sid)):
            if previous != sid:
                await sio.leave_room(sid, previous)
        if generation != generations.get(sid):
            raise HTTPException(409, "Conversation selection changed.")
        await sio.enter_room(sid, room)
        return {"success": True}
    except HTTPException as error:
        return await failed(sid, error.detail)


@sio.event
async def leave_room(sid, room):
    try:
        parse_room(room)
        with SessionLocal() as db:
            session_user(db, connections.get(sid, ""))
        generations[sid] = generations.get(sid, 0) + 1
        await sio.leave_room(sid, room)
        return {"success": True}
    except HTTPException as error:
        return await failed(sid, error.detail)


@sio.event
async def send_message(sid, data):
    try:
        payload = SocketMessageRequest.model_validate(data)
        teacher_id, parent_id = parse_room(payload.room)
        if payload.room not in sio.rooms(sid):
            raise HTTPException(403, "Join the conversation before sending.")
        with SessionLocal() as db:
            user = session_user(db, connections.get(sid, ""))
            teacher, parent = authorize_conversation(db, user, teacher_id, parent_id)
            role = SenderRole.TEACHER if user.role.value == "admin" else SenderRole.PARENT
            message = db.query(Message).filter_by(message_id=payload.message_id, teacher_id=teacher_id, parent_id=parent_id, sender_role=role, is_archived=False).first()
            if message is None:
                raise HTTPException(403, "Message is not authorized for this conversation.")
            record = MessageResponse.model_validate(message).model_dump(mode="json")
            recipient = parent.user_id if role == SenderRole.TEACHER else teacher.user_id
        for target, token in list(connections.items()):
            if target == sid or payload.room not in sio.rooms(target):
                continue
            try:
                with SessionLocal() as db:
                    current = session_user(db, token)
                    if current.user_id != recipient:
                        continue
                    authorize_conversation(db, current, teacher_id, parent_id)
                await sio.emit("receive_message", record, to=target)
            except HTTPException:
                await sio.disconnect(target)
        return {"success": True}
    except (HTTPException, ValidationError) as error:
        return await failed(sid, error.detail if isinstance(error, HTTPException) else "A valid saved message and room are required.")


async def disconnect_all() -> None:
    for sid in list(connections):
        await sio.disconnect(sid)

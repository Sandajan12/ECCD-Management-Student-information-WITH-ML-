"""Socket.IO transports persisted messages; the database remains authoritative."""
import re
import socketio
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import QueryParams
from starlette.responses import JSONResponse
from fastapi import HTTPException
from pydantic import ValidationError
from backend.config.database import SessionLocal
from backend.models import Message
from backend.models.message import SenderRole
from backend.schemas.message import MessageResponse, SocketMessageRequest
from backend.utils.authentication import session_user
from backend.utils.messaging import authorize_conversation
from backend.config.settings import settings
from backend.utils.rate_limits import limits, client_key, POLICIES
from backend.utils.uploads import JSON_LIMIT

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=settings.allowed_origins, max_http_buffer_size=JSON_LIMIT)
connections: dict[str, str] = {}
generations: dict[str, int] = {}
socket_clients: dict[str, str] = {}


class SocketHandshakeMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket") and scope["path"].rstrip("/") == "/socket.io" and scope.get("method", "GET") != "OPTIONS" and "sid" not in QueryParams(scope.get("query_string", b"").decode()):
            status, message, retry = 429, POLICIES["socket-connect"].message, 0
            try:
                retry = await run_in_threadpool(limits.hit, "socket-connect", client_key(scope))
            except Exception:
                status, message = 503, "Connection service is temporarily unavailable."
            if retry or status == 503:
                if scope["type"] == "http":
                    response = JSONResponse({"success": False, "status": status, "message": message}, status_code=status, headers={"Retry-After": str(retry)} if retry else {})
                    await response(scope, receive, send)
                else:
                    await send({"type": "websocket.close", "code": 1008, "reason": message})
                return
            scope["ames.handshake_checked"] = True
        await self.app(scope, receive, send)


async def socket_budget(sid):
    try:
        for namespace, key in (("socket-packets", sid), ("socket-events", socket_clients.get(sid, "unknown"))):
            retry = await run_in_threadpool(limits.hit, namespace, key)
            if retry:
                result = {"success": False, "status": 429, "message": POLICIES[namespace].message, "retryAfter": retry}
                await sio.emit("rate_limit_error", result, to=sid)
                await sio.disconnect(sid)
                return result
    except Exception:
        result = {"success": False, "status": 503, "message": "Connection service is temporarily unavailable."}
        await sio.emit("rate_limit_error", result, to=sid)
        await sio.disconnect(sid)
        return result
    return None


def parse_room(room: object) -> tuple[int, int]:
    match = re.fullmatch(r"teacher-([1-9][0-9]*)-parent-([1-9][0-9]*)", room) if isinstance(room, str) else None
    if not match or any(int(value) > 2147483647 for value in match.groups()):
        raise HTTPException(400, "Invalid conversation room.")
    return int(match[1]), int(match[2])


def authenticate_socket(token: str) -> None:
    # Each worker owns its session, and only plain data returns to the loop.
    with SessionLocal() as db:
        user = session_user(db, token)
        if user.role.value not in ("admin", "user"):
            raise HTTPException(403, "No authorized messaging relationship.")


def authorize_socket(token: str, teacher_id: int, parent_id: int, recipient: int | None = None) -> bool:
    with SessionLocal() as db:
        user = session_user(db, token)
        if recipient is not None and user.user_id != recipient:
            return False
        authorize_conversation(db, user, teacher_id, parent_id)
        return True


def saved_socket_message(token: str, teacher_id: int, parent_id: int, message_id: int) -> tuple[dict, int]:
    with SessionLocal() as db:
        user = session_user(db, token)
        teacher, parent = authorize_conversation(db, user, teacher_id, parent_id)
        role = SenderRole.TEACHER if user.role.value == "admin" else SenderRole.PARENT
        message = db.query(Message).filter_by(message_id=message_id, teacher_id=teacher_id, parent_id=parent_id, sender_role=role, is_archived=False).first()
        if message is None:
            raise HTTPException(403, "Message is not authorized for this conversation.")
        return (MessageResponse.model_validate(message).model_dump(mode="json"),
                parent.user_id if role == SenderRole.TEACHER else teacher.user_id)


@sio.event
async def connect(sid, environ, auth):
    scope = environ.get("asgi.scope", {})
    key = client_key(scope)
    if not scope.get("ames.handshake_checked"):
        try:
            if await run_in_threadpool(limits.hit, "socket-connect", key):
                return False
        except Exception:
            return False
    token = auth.get("token") if isinstance(auth, dict) else None
    if not isinstance(token, str):
        return False
    try:
        await run_in_threadpool(authenticate_socket, token)
        connections[sid] = token
        socket_clients[sid] = key
        return True
    except HTTPException:
        return False


@sio.event
async def disconnect(sid, reason=None):
    connections.pop(sid, None)
    generations.pop(sid, None)
    socket_clients.pop(sid, None)
    limits.forget_socket(sid)


async def failed(sid, message):
    result = {"success": False, "message": message}
    await sio.emit("chat_error", result, to=sid)
    return result


@sio.event
async def join_room(sid, room):
    if result := await socket_budget(sid):
        return result
    generation = generations[sid] = generations.get(sid, 0) + 1
    try:
        teacher_id, parent_id = parse_room(room)
        await run_in_threadpool(authorize_socket, connections.get(sid, ""), teacher_id, parent_id)
        if generation != generations.get(sid) or sid not in connections:
            raise HTTPException(409, "Conversation selection changed.")
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
    if result := await socket_budget(sid):
        return result
    try:
        parse_room(room)
        generation = generations[sid] = generations.get(sid, 0) + 1
        await run_in_threadpool(authenticate_socket, connections.get(sid, ""))
        if generation != generations.get(sid) or sid not in connections:
            raise HTTPException(409, "Conversation selection changed.")
        await sio.leave_room(sid, room)
        return {"success": True}
    except HTTPException as error:
        return await failed(sid, error.detail)


@sio.event
async def send_message(sid, data):
    if result := await socket_budget(sid):
        return result
    try:
        payload = SocketMessageRequest.model_validate(data)
        teacher_id, parent_id = parse_room(payload.room)
        if payload.room not in sio.rooms(sid):
            raise HTTPException(403, "Join the conversation before sending.")
        record, recipient = await run_in_threadpool(saved_socket_message, connections.get(sid, ""), teacher_id, parent_id, payload.message_id)
        for target, token in list(connections.items()):
            if target == sid or payload.room not in sio.rooms(target):
                continue
            try:
                if not await run_in_threadpool(authorize_socket, token, teacher_id, parent_id, recipient):
                    continue
                if connections.get(target) != token or payload.room not in sio.rooms(target):
                    continue
                await sio.emit("receive_message", record, to=target)
            except HTTPException:
                await sio.disconnect(target)
        return {"success": True}
    except (HTTPException, ValidationError) as error:
        return await failed(sid, error.detail if isinstance(error, HTTPException) else "A valid saved message and room are required.")


async def disconnect_all() -> None:
    for sid in list(connections):
        await sio.disconnect(sid)


@sio.on("*")
async def unknown_event(event, sid, *data):
    if result := await socket_budget(sid):
        return result
    return await failed(sid, "Unsupported chat event.")

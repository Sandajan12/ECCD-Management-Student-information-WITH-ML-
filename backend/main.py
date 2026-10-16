from contextlib import asynccontextmanager
import logging
import time
import socketio
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text
from backend.routes import auth, eccd, sections, students, settings, analytics, teachers, messages, backup, eccd_config, chairman, parents
from backend.config.database import SessionLocal, engine
from backend.migrations.phase2 import check_phase2
from backend.utils.realtime import sio
from backend.utils.reference_data import seed_reference_data
from backend.schemas.common import MessageResult
from backend.config.settings import settings as runtime_settings
from backend.config.database import database_ready
from backend.schemas.health import HealthResponse, ReadinessResponse
from backend.utils.http_middleware import RequestLimitsMiddleware, SecurityHeadersMiddleware, UnreadPollingFilter, security_headers
from backend.utils.realtime import SocketHandshakeMiddleware
from backend.migrations.parity_batch2 import check_batch2
from backend.migrations.parent_linking import check_parent_linking

access_logger = logging.getLogger("uvicorn.access")
if not any(isinstance(item, UnreadPollingFilter) for item in access_logger.filters):
    access_logger.addFilter(UnreadPollingFilter())

@asynccontextmanager
async def lifespan(api):
    # Upgrades are explicit, transactional commands; startup never changes an
    # existing table layout or provisions accounts.
    with engine.connect() as connection:
        schema = connection.execute(text("SELECT current_schema()")).scalar_one()
        check_parent_linking(connection, schema)
        check_phase2(connection, schema)
        check_batch2(connection, schema)
    with SessionLocal() as db:
        seed_reference_data(db)
    if runtime_settings.otp_enabled:
        logging.getLogger("uvicorn.error").info("[AUTH] Email OTP enabled; SMTP delivery active.")
    else:
        logging.getLogger("uvicorn.error").info("[DEV] OTP bypass enabled; SMTP delivery skipped.")
    yield

api = FastAPI(title="AMES System", lifespan=lifespan)

api.add_middleware(GZipMiddleware, minimum_size=500)
api.add_middleware(RequestLimitsMiddleware)
api.add_middleware(SecurityHeadersMiddleware)

# Configure CORS for the Vite/React frontend
api.add_middleware(
    CORSMiddleware,
    allow_origins=runtime_settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# Mount Routers
for router in (auth.router, eccd.router, sections.router, students.router,
               students.message_router, students.chairman_router, settings.router, settings.chairman_router,
               analytics.router, analytics.legacy_router, teachers.router, teachers.student_router, messages.router, backup.router,
               backup.chairman_router, eccd_config.router, eccd_config.chairman_router,
               chairman.router, parents.router):
    api.include_router(router)

@api.get("/", response_model=MessageResult)
def root():
    return {"message": "Welcome to the AMES System API"}


@api.get("/healthz", response_model=HealthResponse)
@api.get("/api/health", response_model=HealthResponse)
def health():
    return {"status": "ok", "timestamp": int(time.time() * 1000)}


@api.get("/ready", response_model=ReadinessResponse, response_model_exclude_none=True, responses={503: {"model": ReadinessResponse}})
def ready():
    timestamp = int(time.time() * 1000)
    try:
        database_ready()
    except Exception:
        return JSONResponse(status_code=503, content={"status": "unready", "database": "disconnected", "timestamp": timestamp, "error": "Database unavailable"})
    return {"status": "ready", "database": "connected", "timestamp": timestamp}


@api.exception_handler(HTTPException)
async def http_error(request: Request, error: HTTPException):
    content = {"success": False, "detail": error.detail, "message": error.detail}
    if getattr(error, "code", None):
        content["code"] = error.code
    return JSONResponse(status_code=error.status_code, content=content, headers=error.headers)


@api.exception_handler(RequestValidationError)
async def invalid_request(request: Request, error: RequestValidationError):
    # Passwords, challenge tokens and student identifiers must not be echoed in
    # validation responses. Retain FastAPI's location/type/message information.
    details = [{"loc": item["loc"], "type": item["type"], "msg": item["msg"]} for item in error.errors()]
    return JSONResponse(status_code=422, content={"success": False, "detail": details, "message": "Invalid request data."})


@api.exception_handler(Exception)
async def unexpected_error(request: Request, error: Exception):
    # Do not log raw exception strings: SQL/driver errors may contain secrets.
    logging.getLogger("uvicorn.error").error("Unhandled application error (%s).", type(error).__name__)
    headers = security_headers()
    if request.headers.get("origin") in runtime_settings.allowed_origins:
        headers.update({"Access-Control-Allow-Origin": request.headers["origin"], "Access-Control-Allow-Credentials": "true", "Vary": "Origin"})
    return JSONResponse(status_code=500, content={"success": False, "message": "Internal server error"}, headers=headers)


app = SecurityHeadersMiddleware(SocketHandshakeMiddleware(socketio.ASGIApp(sio, other_asgi_app=api)))

from contextlib import asynccontextmanager
import logging
import socketio
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from backend.routes import auth, eccd, sections, students, settings, analytics, teachers, messages, backup, eccd_config, chairman, parents
from backend.config.database import SessionLocal, engine
from backend.migrations.phase2 import check_phase2
from backend.utils.realtime import sio
from backend.utils.reference_data import seed_reference_data
from backend.schemas.common import MessageResult
from backend.config.settings import settings as runtime_settings

@asynccontextmanager
async def lifespan(api):
    # Upgrades are explicit, transactional commands; startup never changes an
    # existing table layout or provisions accounts.
    with engine.connect() as connection:
        check_phase2(connection)
    with SessionLocal() as db:
        seed_reference_data(db)
    if runtime_settings.otp_enabled:
        logging.getLogger("uvicorn.error").info("[AUTH] Email OTP enabled; SMTP delivery active.")
    else:
        logging.getLogger("uvicorn.error").info("[DEV] OTP bypass enabled; SMTP delivery skipped.")
    yield

api = FastAPI(title="AMES System", lifespan=lifespan)

# Configure CORS for the Vite/React frontend
api.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# Mount Routers
for router in (auth.router, eccd.router, sections.router, students.router,
               students.message_router, students.chairman_router, settings.router, settings.chairman_router,
               analytics.router, teachers.router, messages.router, backup.router,
               backup.chairman_router, eccd_config.router, eccd_config.chairman_router,
               chairman.router, parents.router):
    api.include_router(router)

@api.get("/", response_model=MessageResult)
def root():
    return {"message": "Welcome to the AMES System API"}


@api.exception_handler(HTTPException)
async def http_error(request: Request, error: HTTPException):
    return JSONResponse(status_code=error.status_code, content={"detail": error.detail, "message": error.detail}, headers=error.headers)


@api.exception_handler(RequestValidationError)
async def invalid_request(request: Request, error: RequestValidationError):
    # Passwords, challenge tokens and student identifiers must not be echoed in
    # validation responses. Retain FastAPI's location/type/message information.
    details = [{"loc": item["loc"], "type": item["type"], "msg": item["msg"]} for item in error.errors()]
    return JSONResponse(status_code=422, content={"detail": details, "message": "Invalid request data."})


app = socketio.ASGIApp(sio, other_asgi_app=api)

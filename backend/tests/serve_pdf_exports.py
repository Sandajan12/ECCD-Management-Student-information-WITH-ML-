"""Loopback-only PDF browser fixture; SQLite synthetic records, no school database."""
import atexit
from typing import Literal

import uvicorn
from fastapi import Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from backend.models import User
from backend.routes.auth import router as auth_router
from backend.schemas.auth import LoginResponse, SessionUser
from backend.tests.test_eccd_card_exports import EccdCardExportTests
from backend.utils.authentication import build_session, deliver_session
from backend.utils.deps import get_current_user


fixture = EccdCardExportTests()
fixture.setUp()
atexit.register(fixture.doCleanups)
app = fixture.client.app
# Keep real JWT/account/role enforcement; only the database dependency is replaced.
app.dependency_overrides.pop(get_current_user)
app.include_router(auth_router)
app.add_middleware(
    CORSMiddleware, allow_origins=["http://127.0.0.1:5195"],
    allow_credentials=True, allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Disposition"],
)


@app.get("/healthz")
def health():
    return {"ok": True}


@app.post("/__test/session/{user_id}", response_model=LoginResponse)
def session(user_id: Literal["1", "2"], request: Request, response: Response):
    # Test-only session bootstrap, using the same signed JWT and HttpOnly cookie delivery.
    result = build_session(fixture.db, fixture.db.get(User, int(user_id)))
    fixture.db.commit()
    return deliver_session(result, request, response)


@app.get("/__test/session", response_model=SessionUser)
def session_check(user: User = Depends(get_current_user)):
    return {"id": user.user_id, "role": user.role.value}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8776, log_level="warning")

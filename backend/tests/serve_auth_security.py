"""Loopback browser fixture: real auth with synthetic, captured OTP delivery.

Never deploy this module. The ordinary application has no OTP inspection route.
"""
import argparse
import asyncio

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field
import uvicorn

from backend.tests.serve_phase3 import fixture, main
from backend.config.settings import settings
from backend.models import EmailVerification
from backend.routes import auth, teachers

codes: dict[str, str] = {}


class SerializedTestRequests:
    """Keep in-flight API requests out of disposable-schema reset intervals."""
    def __init__(self, app):
        self.app = app
        self.lock = asyncio.Lock()

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"].startswith(("/api/", "/__test/")):
            async with self.lock:
                return await self.app(scope, receive, send)
        return await self.app(scope, receive, send)


async def captured_email(email: str, code: str) -> None:
    codes[email] = code


auth.send_otp_email = teachers.send_otp_email = captured_email


class ModeRequest(BaseModel):
    enabled: bool = True
    reset_challenges: bool = False
    access_minutes: int = Field(default=30, ge=1, le=30)


class ModeResponse(BaseModel):
    success: bool = True


class OtpResponse(BaseModel):
    otp: str | None


def loopback(request: Request) -> None:
    if request.client.host not in ("127.0.0.1", "::1") or settings.production:
        raise HTTPException(403, "Loopback test fixture only")


@main.api.post("/__test/auth/mode", response_model=ModeResponse, include_in_schema=False)
def mode(payload: ModeRequest, request: Request):
    loopback(request)
    settings.ENABLE_OTP = payload.enabled
    settings.ACCESS_TOKEN_EXPIRE_MINUTES = payload.access_minutes
    codes.clear()
    if payload.reset_challenges:
        with fixture.sessions() as db:
            db.query(EmailVerification).delete()
            db.commit()
    return {"success": True}


@main.api.get("/__test/auth/otp", response_model=OtpResponse, include_in_schema=False)
def otp(request: Request, email: str):
    loopback(request)
    return {"otp": codes.get(email)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8776)
    args = parser.parse_args()
    uvicorn.run(SerializedTestRequests(main.app), host="127.0.0.1", port=args.port, log_level="warning")

"""Account-bound sessions, challenges and remembered-device business logic."""
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import secrets

from fastapi import HTTPException, Request, Response
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from backend.config.settings import settings
from backend.models import EmailVerification, Section, SectionTeacher, Teacher, User, UserTrustedDevice
from backend.models.email_verification import OtpPurpose
from backend.utils.security import create_access_token


def now() -> datetime:
    return datetime.now(timezone.utc)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def signed_digest(value: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()


def credential_version(user: User) -> str:
    return signed_digest(json.dumps([user.user_id, user.email, user.password_hash], separators=(",", ":")))


def require_active(db: Session, user: User | None) -> User:
    if user is None or not user.is_active or user.is_registration_pending:
        raise HTTPException(403, "This account is inactive. Please contact the administrator.")
    if user.role is None or user.role.value not in ("super-admin", "admin", "user"):
        raise HTTPException(403, "Invalid account role.")
    if user.role.value == "admin" and not db.query(Teacher).filter_by(user_id=user.user_id).first():
        raise HTTPException(403, "Teacher profile is unavailable.")
    return user


def session_user(db: Session, token: str, allow_first_login: bool = False) -> User:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("tokenType") != "session" or not isinstance(payload.get("id"), int):
            raise ValueError()
        user = db.get(User, payload["id"])
        if user is None or payload.get("credentialVersion") != credential_version(user) or payload.get("role") != user.role.value:
            raise ValueError()
    except (JWTError, ValueError, AttributeError):
        raise HTTPException(401, "Session expired. Please sign in again.") from None
    require_active(db, user)
    if not allow_first_login and user.role.value == "admin" and user.is_first_login:
        raise HTTPException(403, "Change your initial password before accessing the system.")
    return user


def build_session(db: Session, user: User) -> dict:
    require_active(db, user)
    section = None
    teacher = db.query(Teacher).filter_by(user_id=user.user_id).first() if user.role.value == "admin" else None
    if teacher:
        assignment = db.query(SectionTeacher).filter_by(teacher_id=teacher.teacher_id, status="Active").order_by((SectionTeacher.role == "Primary Adviser").desc(), SectionTeacher.id).first()
        section = db.get(Section, assignment.section_id) if assignment else None
    payload = {"id": user.user_id, "userId": user.user_id, "sub": user.username, "username": user.username,
               "email": user.email, "role": user.role.value, "is_first_login": int(user.is_first_login),
               "section_id": section.section_id if section else None, "section_name": section.section_name if section else None,
               "allow_eccd_question_management": bool(teacher and teacher.allow_eccd_question_management)}
    claims = {**payload, "tokenType": "session", "credentialVersion": credential_version(user)}
    return {"success": True, "requireOtp": False, "requiresOtp": False, "token": create_access_token(claims), "user": payload,
            "requiresPasswordChange": bool(teacher and user.is_first_login)}


def device_tokens(request: Request, supplied: str | None = None) -> list[str]:
    return list(dict.fromkeys(token for token in (supplied, request.headers.get("x-device-token"), request.cookies.get("device_token"), request.cookies.get("trusted_device_token")) if isinstance(token, str) and 0 < len(token) <= 512))


def trusted_token(db: Session, user: User, tokens: list[str]) -> str | None:
    for token in tokens:
        if db.query(UserTrustedDevice).filter(UserTrustedDevice.user_id == user.user_id, UserTrustedDevice.device_token_hash == digest(token), UserTrustedDevice.expires_at > now()).first():
            return token
    return None


def complete_login(db: Session, user: User, remember: bool, request: Request, response: Response) -> dict:
    result = build_session(db, user)
    if remember:
        db.query(UserTrustedDevice).filter(UserTrustedDevice.user_id == user.user_id, UserTrustedDevice.expires_at <= now()).delete()
        token = secrets.token_hex(32)
        db.add(UserTrustedDevice(user_id=user.user_id, device_token_hash=digest(token), user_agent=request.headers.get("user-agent", "Unknown")[:255], expires_at=now() + timedelta(days=30)))
        result["deviceToken"] = token
        response.set_cookie("device_token", token, max_age=30 * 86400, httponly=True, samesite="lax", secure=False)
    return result


def revoke_credentials(db: Session, user: User) -> None:
    db.query(UserTrustedDevice).filter_by(user_id=user.user_id).delete()
    db.query(EmailVerification).filter_by(user_id=user.user_id).delete()
    user.otp_code = None
    user.otp_expires_at = None


def issue_challenge(db: Session, user: User, purpose: OtpPurpose, email: str | None = None, remember: bool = False) -> tuple[str, str]:
    email = email or user.email
    nonce, otp = secrets.token_hex(32), f"{secrets.randbelow(900000) + 100000:06d}"
    expiry = now() + timedelta(minutes=10)
    token = jwt.encode({"tokenType": "otp-challenge", "purpose": purpose.value, "userId": user.user_id, "email": email,
                       "nonce": nonce, "credentialVersion": credential_version(user), "rememberDevice": remember, "exp": expiry}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    db.query(EmailVerification).filter_by(user_id=user.user_id, purpose=purpose).delete()
    db.add(EmailVerification(email=email, otp="", expires_at=expiry, user_id=user.user_id, purpose=purpose, challenge_hash=digest(token), otp_hash=signed_digest(f"{nonce}:{otp}"), attempts=0))
    return token, otp


def consume_challenge(db: Session, token: str, otp: str, purposes: tuple[OtpPurpose, ...], user_id: int | None = None, email: str | None = None) -> tuple[User, dict, EmailVerification]:
    try:
        if not token or len(token) > 3000:
            raise ValueError()
        decoded = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        purpose = OtpPurpose(decoded["purpose"])
        if decoded.get("tokenType") != "otp-challenge" or purpose not in purposes or (user_id is not None and decoded["userId"] != user_id) or (email is not None and decoded["email"] != email):
            raise ValueError()
    except (JWTError, KeyError, ValueError):
        raise HTTPException(400, "Invalid or expired verification challenge.") from None
    row = db.query(EmailVerification).filter_by(challenge_hash=digest(token), user_id=decoded["userId"], purpose=purpose, email=decoded["email"]).with_for_update().first()
    if row is None or row.expires_at <= now() or row.attempts >= 5:
        raise HTTPException(400, "Invalid, expired or exhausted verification code.")
    if not hmac.compare_digest(row.otp_hash or "", signed_digest(f"{decoded['nonce']}:{otp}")):
        row.attempts += 1
        db.commit()
        raise HTTPException(400, "Invalid verification code.")
    user = db.query(User).filter_by(user_id=row.user_id).with_for_update().first()
    if user is None or decoded["credentialVersion"] != credential_version(user):
        raise HTTPException(400, "Verification challenge is no longer valid.")
    if purpose == OtpPurpose.REGISTRATION:
        if user.role.value != "user" or user.is_active or not user.is_registration_pending:
            raise HTTPException(403, "Account is not pending registration.")
    else:
        require_active(db, user)
    return user, decoded, row

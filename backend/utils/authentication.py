"""Account-bound sessions and single-use verification challenges."""
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import secrets
import math
from urllib.parse import urlsplit

from fastapi import HTTPException, Request, Response
from jose import ExpiredSignatureError, JWTError, jwt
from sqlalchemy.orm import Session
from backend.config.settings import settings
from backend.models import EmailVerification, RefreshSession, Section, SectionTeacher, Teacher, User
from backend.models.email_verification import OtpPurpose
from backend.utils.security import create_access_token, create_refresh_token
from backend.utils.account_identity import account_names


class AuthError(HTTPException):
    def __init__(self, status_code: int, detail: str, code: str):
        super().__init__(status_code, detail)
        self.code = code


REFRESH_COOKIE = "ames_refresh_token"


def verify_auth_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin is None and request.headers.get("referer"):
        try:
            parsed = urlsplit(request.headers["referer"])
        except ValueError:
            raise HTTPException(403, "Authentication request origin is not allowed.") from None
        origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin not in settings.allowed_origins and (origin is not None or settings.production):
        raise HTTPException(403, "Authentication request origin is not allowed.")


def refresh_cookie_options(request: Request) -> dict:
    # Never disable Secure for a remote host, even in a development environment.
    local_http = (not settings.production and request.url.scheme == "http"
                  and request.url.hostname in ("localhost", "127.0.0.1", "::1"))
    return {"httponly": True, "secure": not local_http, "samesite": "strict", "path": "/api/auth"}


def deliver_session(result: dict, request: Request, response: Response) -> dict:
    response.set_cookie(REFRESH_COOKIE, result.pop("refresh_token"),
                        max_age=settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60, **refresh_cookie_options(request))
    clear_device_cookies(response)
    response.headers["Cache-Control"] = "no-store"
    return result


def clear_refresh_cookie(request: Request, response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, **refresh_cookie_options(request))


def revoke_refresh_cookie(db: Session, token: str | None) -> None:
    if not token or len(token) > 3000:
        return
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"], options={"require_exp": True})
        if payload.get("tokenType") == "refresh" and isinstance(payload.get("sid"), str):
            db.query(RefreshSession).filter_by(id=payload["sid"]).delete()
    except (JWTError, ValueError, TypeError):
        pass


def device_cookie_options() -> dict:
    production = settings.production
    return {"httponly": True, "secure": production, "samesite": "none" if production else "lax", "path": "/"}


def clear_device_cookies(response: Response) -> None:
    for name in ("device_token", "trusted_device_token"):
        response.delete_cookie(name, **device_cookie_options())


def now() -> datetime:
    return datetime.now(timezone.utc)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def signed_digest(value: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()


def credential_version(user: User) -> str:
    values = [user.user_id, user.email, user.password_hash]
    # Version zero preserves existing sessions until credentials are revoked.
    if user.security_version:
        values.append(user.security_version)
    return signed_digest(json.dumps(values, separators=(",", ":")))


def require_active(db: Session, user: User | None) -> User:
    if user is None or not user.is_active or user.is_registration_pending:
        raise AuthError(403, "This account is inactive. Please contact the administrator.", "ACCOUNT_INACTIVE")
    if user.role is None or user.role.value not in ("super-admin", "admin", "user"):
        raise HTTPException(403, "Invalid account role.")
    if user.role.value == "admin" and not db.query(Teacher).filter_by(user_id=user.user_id).first():
        raise AuthError(403, "Teacher profile is unavailable.", "ACCOUNT_INACTIVE")
    return user


def session_user(db: Session, token: str, allow_first_login: bool = False) -> User:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"], options={"require_exp": True})
    except ExpiredSignatureError:
        raise AuthError(401, "Session expired. Please sign in again.", "TOKEN_EXPIRED") from None
    except (JWTError, ValueError, AttributeError, TypeError, OverflowError):
        raise AuthError(401, "Session expired. Please sign in again.", "INVALID_TOKEN") from None
    if not isinstance(payload, dict) or payload.get("tokenType") != "session" or type(payload.get("id")) is not int or not 0 < payload["id"] <= 2147483647:
        raise AuthError(401, "Session expired. Please sign in again.", "SESSION_REVOKED")
    user = db.get(User, payload["id"])
    require_active(db, user)
    if payload.get("credentialVersion") != credential_version(user) or payload.get("role") != user.role.value:
        raise AuthError(401, "Session expired. Please sign in again.", "SESSION_REVOKED")
    if not allow_first_login and user.role.value == "admin" and user.is_first_login:
        raise AuthError(403, "Change your initial password before accessing the system.", "PASSWORD_CHANGE_REQUIRED")
    return user


def build_session(db: Session, user: User, refresh: RefreshSession | None = None) -> dict:
    require_active(db, user)
    section = None
    teacher = db.query(Teacher).filter_by(user_id=user.user_id).first() if user.role.value == "admin" else None
    if teacher:
        assignment = db.query(SectionTeacher).filter_by(teacher_id=teacher.teacher_id, role="Primary Adviser", status="Active").order_by(SectionTeacher.id).first()
        section = db.get(Section, assignment.section_id) if assignment else None
    payload = {"id": user.user_id, "userId": user.user_id, "sub": str(user.user_id), **account_names(user, db),
               "email": user.email, "role": user.role.value, "is_first_login": int(user.is_first_login),
               "section_id": section.section_id if section else None, "section_name": section.section_name if section else None,
               "allow_eccd_question_management": bool(teacher and teacher.allow_eccd_question_management)}
    claims = {**payload, "tokenType": "session", "credentialVersion": credential_version(user)}
    access_token = create_access_token(claims)
    if refresh is None:
        db.query(RefreshSession).filter(RefreshSession.user_id == user.user_id, RefreshSession.expires_at <= now()).delete()
        refresh = RefreshSession(id=secrets.token_hex(32), user_id=user.user_id, current_jti=secrets.token_hex(32),
                                 expires_at=now() + timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES))
        db.add(refresh)
    return {"success": True, "requireOtp": False, "requiresOtp": False, "token": access_token,
            "access_token": access_token, "refresh_token": create_refresh_token(user.user_id, claims["credentialVersion"], user.role.value,
                refresh.id, refresh.current_jti, refresh.expires_at), "user": payload,
            "requiresPasswordChange": bool(teacher and user.is_first_login)}


def refresh_session(db: Session, token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"], options={"require_exp": True})
        subject = payload.get("sub")
        if (payload.get("tokenType") != "refresh" or not isinstance(subject, str) or not subject.isascii() or not subject.isdigit()
                or not 0 < int(subject) <= 2147483647 or not isinstance(payload.get("sid"), str)
                or not isinstance(payload.get("jti"), str)):
            raise ValueError()
    except ExpiredSignatureError:
        raise AuthError(401, "Session expired. Please sign in again.", "TOKEN_EXPIRED") from None
    except (JWTError, ValueError, AttributeError, TypeError, OverflowError):
        raise AuthError(401, "Invalid refresh token. Please sign in again.", "INVALID_TOKEN") from None
    # Serialize renewal with credential revocation and read current PostgreSQL state.
    user = db.query(User).filter_by(user_id=int(subject)).populate_existing().with_for_update().first()
    try:
        require_active(db, user)
        if user.role.value == "user" and user.parent is None:
            raise HTTPException(403, "Parent profile is unavailable.")
    except HTTPException:
        raise AuthError(401, "Your account session was revoked. Please sign in again.", "SESSION_REVOKED") from None
    if payload.get("credentialVersion") != credential_version(user) or payload.get("role") != user.role.value:
        raise AuthError(401, "Your account session was revoked. Please sign in again.", "SESSION_REVOKED")
    row = db.query(RefreshSession).filter_by(id=payload["sid"], user_id=user.user_id).with_for_update().first()
    moment = now()
    grace = row is not None and row.previous_valid_until is not None and moment <= row.previous_valid_until
    if (row is None or row.expires_at <= moment or
            (not hmac.compare_digest(payload["jti"], row.current_jti) and
             not (grace and hmac.compare_digest(payload["jti"], row.previous_jti or "")))):
        raise AuthError(401, "Your account session was revoked. Please sign in again.", "SESSION_REVOKED")
    if not grace:
        row.previous_jti = row.current_jti
        row.previous_valid_until = moment + timedelta(seconds=10)
        row.current_jti = secrets.token_hex(32)
        row.expires_at = moment + timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    # Requests during the grace interval receive the same successor cookie, so
    # simultaneous tabs cannot overwrite it with an already consumed predecessor.
    return build_session(db, user, row)


def complete_login(db: Session, user: User, request: Request, response: Response) -> dict:
    return deliver_session(build_session(db, user), request, response)


def revoke_credentials(db: Session, user: User) -> None:
    # Lock the account so concurrent revocations cannot lose a version increment.
    db.refresh(user, attribute_names=["security_version"], with_for_update=True)
    user.security_version += 1
    db.query(RefreshSession).filter_by(user_id=user.user_id).delete()
    db.query(EmailVerification).filter_by(user_id=user.user_id).delete()
    user.otp_code = None
    user.otp_expires_at = None


def issue_challenge(db: Session, user: User, purpose: OtpPurpose, email: str | None = None) -> tuple[str, str]:
    # Serialize challenge issuance per account; browser countdowns alone do not
    # constrain direct API calls or requests arriving at different workers.
    db.query(User).filter_by(user_id=user.user_id).populate_existing().with_for_update().one()
    existing = db.query(EmailVerification).filter_by(user_id=user.user_id, purpose=purpose).first()
    if existing is not None:
        retry = math.ceil((existing.expires_at - timedelta(minutes=10) + timedelta(seconds=60) - now()).total_seconds())
        if retry > 0:
            raise HTTPException(429, "Please wait before requesting another verification code.", headers={"Retry-After": str(retry)})
    email = email or user.email
    nonce = secrets.token_hex(32)
    otp = f"{secrets.randbelow(900000) + 100000:06d}" if settings.otp_enabled else "123456"
    expiry = now() + timedelta(minutes=10)
    token = jwt.encode({"tokenType": "otp-challenge", "purpose": purpose.value, "userId": user.user_id, "email": email,
                       "nonce": nonce, "credentialVersion": credential_version(user), "exp": expiry}, settings.SECRET_KEY, algorithm="HS256")
    db.query(EmailVerification).filter_by(user_id=user.user_id, purpose=purpose).delete()
    db.add(EmailVerification(email=email, otp="", expires_at=expiry, user_id=user.user_id, purpose=purpose, challenge_hash=digest(token), otp_hash=signed_digest(f"{nonce}:{otp}"), attempts=0))
    return token, otp


def consume_challenge(db: Session, token: str, otp: str, purposes: tuple[OtpPurpose, ...], user_id: int | None = None, email: str | None = None) -> tuple[User, dict, EmailVerification]:
    try:
        if not token or len(token) > 3000:
            raise ValueError()
        decoded = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"], options={"require_exp": True})
        purpose = OtpPurpose(decoded["purpose"])
        if decoded.get("tokenType") != "otp-challenge" or purpose not in purposes or (user_id is not None and decoded["userId"] != user_id) or (email is not None and decoded["email"] != email):
            raise ValueError()
    except ExpiredSignatureError:
        raise HTTPException(400, "Code expired. Please request a new code.") from None
    except (JWTError, KeyError, ValueError, TypeError):
        raise HTTPException(400, "Invalid or expired verification challenge.") from None
    # Match issuance/revocation lock ordering: account first, then challenge.
    user = db.query(User).filter_by(user_id=decoded["userId"]).populate_existing().with_for_update().first()
    row = db.query(EmailVerification).filter_by(challenge_hash=digest(token), user_id=decoded["userId"], purpose=purpose, email=decoded["email"]).with_for_update().first()
    if row is None:
        raise HTTPException(400, "Invalid verification code. Please request a new code.")
    if row.expires_at <= now():
        raise HTTPException(400, "Code expired. Please request a new code.")
    if row.attempts >= 5:
        raise HTTPException(400, "Too many incorrect attempts. Please request a new code.")
    if not hmac.compare_digest(row.otp_hash or "", signed_digest(f"{decoded['nonce']}:{otp}")):
        row.attempts += 1
        db.commit()
        raise HTTPException(400, "Invalid verification code.")
    if user is None or decoded["credentialVersion"] != credential_version(user):
        raise HTTPException(400, "Verification challenge is no longer valid.")
    if purpose == OtpPurpose.REGISTRATION:
        if user.role.value != "user" or user.is_active or not user.is_registration_pending:
            raise HTTPException(403, "Account is not pending registration.")
    else:
        require_active(db, user)
    return user, decoded, row


def discard_failed_challenge(db: Session, token: str) -> None:
    """Allow delivery retries without consuming/deleting a newer challenge."""
    db.query(EmailVerification).filter_by(challenge_hash=digest(token)).delete()
    db.commit()

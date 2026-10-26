import logging
from anyio.from_thread import run as run_async

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, MultipleResultsFound
from sqlalchemy.orm import Session
from backend.config.database import get_db
from backend.config.settings import settings
from backend.models import Parent, User
from backend.models.user import UserRole
from backend.models.email_verification import OtpPurpose
from backend.schemas.auth import LoginRequest, LoginResponse, LogoutRequest, LogoutResponse, OtpChallengeResponse, RegisterParentRequest, UpdatePasswordRequest, VerifyOtpRequest
from backend.schemas.account import SendOtpRequest, ChallengeResult
from backend.utils.authentication import build_session, clear_device_cookies, complete_login, consume_challenge, device_tokens, digest, discard_failed_challenge, issue_challenge, require_active, revoke_credentials, set_device_cookies, trusted_token
from backend.utils.deps import get_first_login_user, verify_role
from backend.utils.email import send_otp_email
from backend.utils.security import get_password_hash, verify_password

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/login", response_model=LoginResponse | OtpChallengeResponse, response_model_exclude_none=True)
@router.post("/login-step1", response_model=LoginResponse | OtpChallengeResponse, response_model_exclude_none=True)
def login(data: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    identifier = str(data.email).strip().lower()
    try:
        user = db.query(User).filter(func.lower(User.email) == identifier).one_or_none()
    except MultipleResultsFound:
        raise HTTPException(401, "Invalid email or password.") from None
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password.")
    require_active(db, user)
    if data.otp is not None:
        user, decoded, row = consume_challenge(db, data.challengeToken or "", data.otp, (OtpPurpose.LOGIN,), user.user_id)
        result = complete_login(db, user, decoded["rememberDevice"], request, response)
        db.delete(row)
        db.commit()
        return result
    remembered = trusted_token(db, user, device_tokens(request, data.deviceToken, data.trusted_device_token))
    if remembered:
        set_device_cookies(response, remembered)
        return {**build_session(db, user), "deviceToken": remembered}
    if not settings.otp_enabled:
        result = complete_login(db, user, data.rememberDevice, request, response)
        db.commit()
        logging.getLogger("uvicorn.error").info("[DEV] Bypassed OTP for %s", user.email)
        return result
    token, otp = issue_challenge(db, user, OtpPurpose.LOGIN, remember=data.rememberDevice)
    db.commit()
    try:
        run_async(send_otp_email, user.email, otp)
    except Exception:
        discard_failed_challenge(db, token)
        raise HTTPException(502, "Unable to deliver the verification email. Please retry.") from None
    return {"success": True, "requireOtp": True, "requiresOtp": True, "challengeToken": token, "email": user.email}


@router.post("/verify-otp", response_model=LoginResponse)
def verify_otp(data: VerifyOtpRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    user, decoded, row = consume_challenge(db, data.challengeToken, data.otp, (OtpPurpose.LOGIN, OtpPurpose.REGISTRATION))
    if decoded["purpose"] == "registration":
        user.is_active, user.is_registration_pending = True, False
    result = complete_login(db, user, decoded["rememberDevice"], request, response)
    db.delete(row)
    db.commit()
    return {**result, "message": "Verification successful!"}


@router.post("/register-parent", response_model=LoginResponse | OtpChallengeResponse, status_code=201, response_model_exclude_none=True)
def register_parent(data: RegisterParentRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    email = str(data.email).strip().lower()
    full_name = f"{data.firstName.strip()} {data.lastName.strip()}"
    if len(full_name) > 100 or not data.firstName.strip() or not data.lastName.strip():
        raise HTTPException(400, "Valid names within account field limits are required.")
    existing = db.query(User).filter(func.lower(User.email) == email).with_for_update().all()
    if existing:
        user = existing[0]
        if len(existing) != 1 or user.role != UserRole.USER or user.is_active or not user.is_registration_pending or not verify_password(data.password, user.password_hash):
            raise HTTPException(400, "This email is already registered.")
        response.status_code = 200
    else:
        user = User(email=email, password_hash=get_password_hash(data.password), role=UserRole.USER, is_active=not settings.otp_enabled, is_registration_pending=settings.otp_enabled, is_first_login=False)
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(400, "This email is already registered.") from None
        db.add(Parent(user_id=user.user_id, fullname=full_name, relationship_type=data.relationship))
        db.flush()
    if not settings.otp_enabled:
        user.is_active, user.is_registration_pending = True, False
        result = complete_login(db, user, data.rememberDevice, request, response)
        db.commit()
        return {**result, "message": "Account created. Logging you in..."}
    token, otp = issue_challenge(db, user, OtpPurpose.REGISTRATION, remember=data.rememberDevice)
    db.commit()
    result = {"success": True, "requireOtp": True, "challengeToken": token, "email": user.email, "emailSent": True}
    try:
        run_async(send_otp_email, user.email, otp)
    except Exception:
        discard_failed_challenge(db, token)
        result.update(emailSent=False, code="REGISTRATION_EMAIL_FAILED", message="Your account is awaiting verification. Submit registration again with the same email and password to retry delivery.")
    return result


@router.put("/update-password", response_model=LoginResponse)
def update_password(data: UpdatePasswordRequest, response: Response, db: Session = Depends(get_db), user: User = Depends(get_first_login_user)):
    if user.role != UserRole.ADMIN or not user.is_first_login:
        raise HTTPException(403, "Use the verified password-change flow for your account.")
    if verify_password(data.newPassword, user.password_hash):
        raise HTTPException(400, "Choose a password different from your initial password.")
    user.password_hash, user.is_first_login = get_password_hash(data.newPassword), False
    revoke_credentials(db, user)
    db.flush()
    result = build_session(db, user)
    db.commit()
    clear_device_cookies(response)
    return {**result, "message": "Password updated successfully."}


@router.post("/send-otp", response_model=ChallengeResult, response_model_exclude_none=True)
@router.post("/request-otp", response_model=ChallengeResult, response_model_exclude_none=True)
def send_otp(data: SendOtpRequest, db: Session = Depends(get_db), user: User = Depends(verify_role(["super-admin"]))):
    if not verify_password(data.currentPassword or "", user.password_hash):
        raise HTTPException(401, "Incorrect current password.")
    email = str(data.email).strip().lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(400, "Email is already registered.")
    if not settings.otp_enabled:
        return {"message": "Email verification is disabled for local development."}
    token, otp = issue_challenge(db, user, OtpPurpose.EMAIL_CHANGE, email)
    db.commit()
    try:
        run_async(send_otp_email, email, otp)
    except Exception:
        discard_failed_challenge(db, token)
        raise HTTPException(502, "Unable to deliver the verification email.") from None
    return {"message": "Verification code sent.", "challengeToken": token, "success": True}


@router.post("/logout", response_model=LogoutResponse)
def logout(data: LogoutRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    if data.forgetDevice:
        from backend.models import UserTrustedDevice
        hashes = [digest(token) for token in device_tokens(request, data.deviceToken, data.trusted_device_token)]
        if hashes:
            db.query(UserTrustedDevice).filter(UserTrustedDevice.device_token_hash.in_(hashes)).delete()
            db.commit()
        clear_device_cookies(response)
    return {"success": True}

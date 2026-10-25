from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from backend.config.settings import settings
from backend.models import User
from backend.models.email_verification import OtpPurpose
from backend.schemas.account import AccountUpdateRequest, PasswordChangeVerify
from backend.utils.authentication import build_session, consume_challenge, revoke_credentials
from backend.utils.security import get_password_hash, verify_password


def change_password(db: Session, user: User, payload: PasswordChangeVerify) -> dict:
    if settings.otp_enabled:
        consume_challenge(db, payload.challengeToken or "", payload.otp or "", (OtpPurpose.PASSWORD_CHANGE,), user.user_id, payload.email)
    elif not verify_password(payload.oldPassword or "", user.password_hash):
        raise HTTPException(401, "Incorrect current password.")
    if verify_password(payload.newPassword, user.password_hash):
        raise HTTPException(400, "Choose a different password.")
    user.password_hash = get_password_hash(payload.newPassword)
    revoke_credentials(db, user)
    db.flush()
    result = build_session(db, user)
    db.commit()
    return {**result, "message": "Password updated successfully."}


def update_chairman(db: Session, user: User, payload: AccountUpdateRequest) -> dict:
    if not verify_password(payload.currentPassword, user.password_hash):
        raise HTTPException(401, "Incorrect current password.")
    if not payload.newEmail and not payload.newPassword:
        raise HTTPException(400, "Enter a new email or password.")
    email = str(payload.newEmail).strip().lower() if payload.newEmail else None
    if email and email != user.email:
        if db.query(User).filter(func.lower(User.email) == email, User.user_id != user.user_id).first():
            raise HTTPException(400, "Email is already registered.")
        if settings.otp_enabled:
            consume_challenge(db, payload.challengeToken or "", payload.otp or "", (OtpPurpose.EMAIL_CHANGE,), user.user_id, email)
        user.email = email
    if payload.newPassword:
        if verify_password(payload.newPassword, user.password_hash):
            raise HTTPException(400, "Choose a different password.")
        user.password_hash = get_password_hash(payload.newPassword)
    revoke_credentials(db, user)
    db.flush()
    result = build_session(db, user)
    db.commit()
    return {**result, "email": user.email, "message": "Account updated successfully."}

from backend.config.database import get_db
from backend.models.user import User
from backend.models.email_verification import EmailVerification
from backend.utils.security import create_access_token, verify_password, get_password_hash
from backend.models.parent import Parent
from backend.schemas.account import SendOtpRequest
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
import random
import secrets
from datetime import datetime, timedelta, timezone
from backend.utils.email import send_otp_email

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    # Query database for user
    user = db.query(User).filter(User.email == login_data.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # Verify hashed password via native bcrypt
    if not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if getattr(user, "is_active", True) is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been archived. Please contact the Chairman.",
        )

    section_name = None
    section_id = None
    allow_eccd_question_management = False

    role_str = user.role.value if user.role else "user"
    if role_str in ["admin", "teacher"]:
        from backend.models.teacher import Teacher
        from backend.models.section_teacher import SectionTeacher
        from backend.models.section import Section

        teacher = (
            db.query(Teacher).filter(Teacher.user_id == user.user_id).first()
        )
        if teacher:
            allow_eccd_question_management = bool(teacher.allow_eccd_question_management)
            active_st = (
                db.query(SectionTeacher, Section)
                .join(Section, SectionTeacher.section_id == Section.section_id)
                .filter(
                    SectionTeacher.teacher_id == teacher.teacher_id,
                    SectionTeacher.status == "Active",
                )
                .order_by((SectionTeacher.role == "Primary Adviser").desc())
                .first()
            )
            if active_st:
                section_id = active_st[1].section_id
                section_name = active_st[1].section_name

    # Format JWT Payload to match legacy Express logic and new deps.py logic
    payload = {
        "sub": user.username,  # Required by our deps.py (get_current_user)
        "id": user.user_id,
        "username": user.username,
        "role": role_str,
        "section_name": section_name,
        "section_id": section_id,
        "allow_eccd_question_management": allow_eccd_question_management,
    }

    token = create_access_token(data=payload)

    # Match the legacy JSON response structure exactly 1:1
    return {"message": "Login successful!", "token": token, "user": payload}

@router.post("/send-otp")
async def send_otp(request: SendOtpRequest, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered.")

    otp = str(random.randint(100000, 999999))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    
    verification = EmailVerification(email=request.email, otp=otp, expires_at=expires_at)
    db.add(verification)
    db.commit()

    await send_otp_email(request.email, otp)
    
    return {"message": "OTP sent successfully."}


class OtpRequest(BaseModel):
    email: str

class VerifyOtpRequest(BaseModel):
    email: str
    otp: str

@router.post("/request-otp")
async def request_otp(data: OtpRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    otp = "".join([str(secrets.randbelow(10)) for _ in range(6)])
    user.otp_code = otp
    user.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.commit()
    
    await send_otp_email(data.email, otp)
    return {"message": "OTP sent successfully."}

@router.post("/verify-otp")
def verify_otp(data: VerifyOtpRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    if not user.otp_code or user.otp_code != data.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP code.")
        
    expires_at = user.otp_expires_at.replace(tzinfo=timezone.utc) if user.otp_expires_at.tzinfo is None else user.otp_expires_at
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OTP code has expired.")
        
    user.otp_code = None
    user.otp_expires_at = None
    db.commit()
    
    return {"message": "OTP verified successfully."}

class RegisterParentRequest(BaseModel):
    email: str
    password: str
    otp: str
    firstName: str
    lastName: str
    relationship: str

@router.post("/register-parent")
def register_parent(data: RegisterParentRequest, db: Session = Depends(get_db)):
    # 1. OTP Verification
    verification = db.query(EmailVerification).filter(
        EmailVerification.email == data.email,
        EmailVerification.otp == data.otp
    ).order_by(EmailVerification.id.desc()).first()

    if not verification:
        raise HTTPException(status_code=400, detail="Invalid verification code.")
    
    expires_at = verification.expires_at.replace(tzinfo=timezone.utc) if verification.expires_at.tzinfo is None else verification.expires_at
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification code has expired.")

    # Check for duplicates
    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered.")

    # 2. Account Generation
    username = data.email.split('@')[0]
    hashed_password = get_password_hash(data.password)
    
    new_user = User(
        username=username,
        email=data.email,
        password_hash=hashed_password,
        role="user",
        is_active=True
    )
    db.add(new_user)
    db.flush() # Secure the new_user.user_id

    # 3. Parent Profile Generation
    fullname = f"{data.firstName or ''} {data.lastName or ''}".strip()
    new_parent = Parent(
        user_id=new_user.user_id,
        fullname=fullname or None,
        relationship_type=data.relationship or 'Guardian'
    )
    db.add(new_parent)

    # 4. OTP Cleanup
    db.query(EmailVerification).filter(EmailVerification.email == data.email).delete()
    db.commit()

    # 5. Auto-Login Payload
    payload = {
        "sub": new_user.username,
        "id": new_user.user_id,
        "username": new_user.username,
        "role": new_user.role.value if new_user.role else "user",
    }
    token = create_access_token(data=payload)

    return {"message": "Account verified! Logging you in...", "token": token, "user": payload}

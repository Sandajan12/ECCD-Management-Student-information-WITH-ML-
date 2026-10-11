from typing import Callable
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from backend.config.database import get_db
from backend.models import Teacher, User
from backend.utils.authentication import session_user

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    return session_user(db, token)


def get_first_login_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    return session_user(db, token, allow_first_login=True)


def verify_role(allowed_roles: list[str]) -> Callable:
    def check(user: User = Depends(get_current_user)) -> User:
        if user.role.value not in allowed_roles:
            raise HTTPException(403, "Operation not permitted.")
        return user
    return check


def verify_eccd_question_access(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    if user.role.value == "super-admin":
        return user
    teacher = db.query(Teacher).filter_by(user_id=user.user_id).first()
    if user.role.value == "admin" and teacher and teacher.allow_eccd_question_management:
        return user
    raise HTTPException(403, "You do not have permission to manage ECCD questions.")

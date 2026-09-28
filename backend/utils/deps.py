from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from typing import Callable

# Re-export get_db so all dependencies are in one place
from backend.config.database import get_db
from backend.config.settings import settings
from backend.models.user import User

# This URL should match the route that accepts login credentials
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        # We assume the user's username or user_id is encoded in the 'sub' subject claim
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    
    # Check if soft-deleted/archived
    if not getattr(user, 'is_active', True):
        raise HTTPException(status_code=400, detail="Inactive user")
        
    return user

def verify_role(allowed_roles: list[str]) -> Callable:
    def role_checker(current_user: User = Depends(get_current_user)):
        # current_user.role is an Enum, we check its string value
        if current_user.role and current_user.role.value not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted"
            )
        return current_user
    return role_checker


def verify_eccd_question_access(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    role_val = current_user.role.value if current_user.role else ""
    if role_val in ["super-admin", "chairman"]:
        return current_user

    if role_val in ["admin", "teacher"]:
        from backend.models.teacher import Teacher

        teacher = (
            db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
        )
        if teacher and bool(teacher.allow_eccd_question_management):
            return current_user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied. You do not have permission to manage ECCD questions.",
    )

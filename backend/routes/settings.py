import base64
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.models.settings import SystemSettings
from backend.models.student import Student
from backend.models.message import Message
from backend.schemas.settings import SettingsResponse
from backend.utils.deps import verify_role

router = APIRouter(prefix="/api/settings", tags=["settings"])


def get_or_create_settings(db: Session) -> SystemSettings:
    setting = db.query(SystemSettings).filter(SystemSettings.id == 1).first()
    if not setting:
        setting = SystemSettings(id=1)
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting


@router.get("", response_model=SettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    return get_or_create_settings(db)


@router.put("/update", response_model=dict)
async def update_settings(
    system_title: str = Form(...),
    primary_color: str = Form(...),
    existing_logo_url: Optional[str] = Form(None),
    existing_profile_pic_url: Optional[str] = Form(None),
    systemLogo: Optional[UploadFile] = File(None),
    profilePic: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "chairman"])),
):
    setting = get_or_create_settings(db)

    setting.system_title = system_title
    setting.primary_color = primary_color

    if systemLogo:
        file_bytes = await systemLogo.read()
        encoded = base64.b64encode(file_bytes).decode("utf-8")
        setting.logo_url = f"data:{systemLogo.content_type};base64,{encoded}"
    elif existing_logo_url is not None:
        setting.logo_url = existing_logo_url

    if profilePic:
        file_bytes = await profilePic.read()
        encoded = base64.b64encode(file_bytes).decode("utf-8")
        setting.profile_pic_url = f"data:{profilePic.content_type};base64,{encoded}"
    elif existing_profile_pic_url is not None:
        setting.profile_pic_url = existing_profile_pic_url

    db.commit()
    db.refresh(setting)

    return {
        "message": "Settings updated successfully!",
        "settings": {
            "system_title": setting.system_title,
            "primary_color": setting.primary_color,
            "logo_url": setting.logo_url,
            "profile_pic_url": setting.profile_pic_url,
        },
    }


@router.post("/upload-background")
async def upload_background(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    file_bytes = await file.read()
    encoded_string = base64.b64encode(file_bytes).decode("utf-8")
    data_uri = f"data:{file.content_type};base64,{encoded_string}"

    setting = get_or_create_settings(db)
    setting.login_background = data_uri
    db.commit()
    db.refresh(setting)

    return {"message": "Background uploaded successfully", "url": data_uri}




@router.post("/rollover")
def rollover_year(
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "chairman"])),
):
    setting = get_or_create_settings(db)

    current_year_str = setting.current_school_year or "2026-2027"
    parts = current_year_str.split("-")
    next_year_str = "2027-2028"
    if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
        next_year_str = f"{int(parts[0]) + 1}-{int(parts[1]) + 1}"

    setting.previous_school_year = current_year_str
    setting.current_school_year = next_year_str
    setting.last_rollover_timestamp = datetime.now(timezone.utc).isoformat()

    # Soft archive students
    db.query(Student).filter(Student.is_active == True).update({"is_active": False})

    # Archive messages
    db.query(Message).filter(Message.is_archived == False).update({"is_archived": True})

    db.commit()
    return {
        "message": "System successfully rolled over to the next school year.",
        "next_school_year": next_year_str,
    }


@router.post("/undo-rollover")
def undo_rollover(
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "chairman"])),
):
    setting = get_or_create_settings(db)

    if not setting.last_rollover_timestamp or not setting.previous_school_year:
        raise HTTPException(
            status_code=400, detail="No rollover history found to undo."
        )

    last_rollover = datetime.fromisoformat(setting.last_rollover_timestamp)
    now = datetime.now(timezone.utc)
    diff_in_hours = (now - last_rollover).total_seconds() / 3600

    if diff_in_hours > 24:
        raise HTTPException(
            status_code=400, detail="The 24-hour undo window has expired."
        )

    setting.current_school_year = setting.previous_school_year
    setting.previous_school_year = None
    setting.last_rollover_timestamp = None

    db.query(Student).filter(Student.is_active == False).update({"is_active": True})
    db.query(Message).filter(Message.is_archived == True).update({"is_archived": False})

    db.commit()

    return {
        "message": "Rollover successfully undone. System restored to the previous school year.",
        "restored_school_year": setting.current_school_year,
    }

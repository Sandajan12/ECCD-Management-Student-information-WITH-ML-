import base64
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import ValidationError
from sqlalchemy.orm import Session
from backend.config.database import get_db
from backend.models import SystemLog, User
from backend.schemas.settings import BackgroundResult, SettingsUpdateResult, SchoolSettingsResponse, SchoolSettingsUpdate, RolloverRequest, RolloverResponse, RolloverUndoResponse
from backend.utils.deps import verify_role
from backend.utils.rollover import settings_record, rollover, undo_availability, undo_rollover

router = APIRouter(prefix="/api/settings", tags=["Settings"])
chairman_router = APIRouter(prefix="/api/chairman", tags=["School year"])


@router.get("", response_model=SchoolSettingsResponse)
@router.get("/", response_model=SchoolSettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    setting = settings_record(db)
    db.commit()
    return {**SchoolSettingsResponse.model_validate(setting).model_dump(), **undo_availability(setting)}


@router.put("/update", response_model=SettingsUpdateResult)
async def update_settings(request: Request, db: Session = Depends(get_db), user: User = Depends(verify_role(["super-admin"]))):
    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            data, form = await request.json(), None
        except ValueError:
            raise HTTPException(422, "Invalid JSON school settings.") from None
    else:
        form = await request.form()
        data = {key: value for key, value in form.items() if isinstance(value, str)}
    try:
        payload = SchoolSettingsUpdate.model_validate(data)
    except ValidationError:
        raise HTTPException(422, "Invalid school settings, colour or opening month.") from None
    setting = settings_record(db)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(setting, key, value)
    for field, existing, upload in (("logo_url", "existing_logo_url", "systemLogo"), ("profile_pic_url", "existing_profile_pic_url", "profilePic")):
        if form and form.get(upload) and hasattr(form[upload], "read"):
            file = form[upload]
            if not (file.content_type or "").startswith("image/"):
                raise HTTPException(400, "Branding files must be images.")
            encoded = base64.b64encode(await file.read()).decode()
            setattr(setting, field, f"data:{file.content_type};base64,{encoded}")
        elif existing in data:
            setattr(setting, field, data[existing])
    db.add(SystemLog(user_id=user.user_id, action_type="UPDATE_SYSTEM_SETTINGS", details=f"Updated school configuration; opening month {setting.school_year_start_month}."))
    db.commit()
    return {"message": "Settings updated successfully!", "settings": {**SchoolSettingsResponse.model_validate(setting).model_dump(), **undo_availability(setting)}}


@router.post("/upload-background", response_model=BackgroundResult)
async def upload_background(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(verify_role(["super-admin"]))):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "File must be an image.")
    url = f"data:{file.content_type};base64,{base64.b64encode(await file.read()).decode()}"
    setting = settings_record(db)
    setting.login_background = url
    db.commit()
    return {"message": "Background uploaded successfully", "url": url}


@router.post("/rollover", response_model=RolloverResponse)
@chairman_router.post("/rollover-year", response_model=RolloverResponse)
def rollover_year(payload: RolloverRequest = RolloverRequest(), db: Session = Depends(get_db), user: User = Depends(verify_role(["super-admin"]))):
    return rollover(db, user, payload)


@router.post("/undo-rollover", response_model=RolloverUndoResponse)
@router.post("/revert-school-year", response_model=RolloverUndoResponse)
@chairman_router.post("/undo-rollover", response_model=RolloverUndoResponse)
def revert_year(db: Session = Depends(get_db), user: User = Depends(verify_role(["super-admin"]))):
    return undo_rollover(db, user)

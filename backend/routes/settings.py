import base64
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from backend.config.database import get_db
from backend.models import SystemLog, User
from backend.schemas.settings import SettingsUpdateResult, SchoolSettingsResponse, SchoolSettingsUpdate, RolloverRequest, RolloverResponse, RolloverUndoResponse
from backend.utils.deps import verify_role
from backend.utils.rollover import settings_record, rollover, undo_availability, undo_rollover
from backend.utils.uploads import branding_image

router = APIRouter(prefix="/api/settings", tags=["Settings"])
chairman_router = APIRouter(prefix="/api/chairman", tags=["School year"])


@router.get("", response_model=SchoolSettingsResponse)
@router.get("/", response_model=SchoolSettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    setting = settings_record(db)
    db.commit()
    return {**SchoolSettingsResponse.model_validate(setting).model_dump(), **undo_availability(setting)}


@router.put("/update", response_model=SettingsUpdateResult)
@router.put("", response_model=SettingsUpdateResult)
async def update_settings(request: Request, db: Session = Depends(get_db), user: User = Depends(verify_role(["super-admin"]))):
    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            data = await request.json()
        except ValueError:
            raise HTTPException(422, "Invalid JSON system settings.") from None
        return await save_settings(data, None, db, user)
    async with request.form() as form:
        data = {key: value for key, value in form.items() if isinstance(value, str)}
        return await save_settings(data, form, db, user)


async def save_settings(data, form, db: Session, user: User):
    try:
        payload = SchoolSettingsUpdate.model_validate(data)
    except ValidationError:
        raise HTTPException(422, "Invalid system settings, colour or opening month.") from None
    images = {}
    if form and form.get("systemLogo") and hasattr(form["systemLogo"], "read"):
        file = form["systemLogo"]
        encoded = base64.b64encode(await branding_image(file)).decode()
        images["logo_url"] = f"data:{file.content_type};base64,{encoded}"
    elif "existing_logo_url" in data:
        images["logo_url"] = data["existing_logo_url"]
    return await run_in_threadpool(persist_settings, payload, images, db, user)


def persist_settings(payload: SchoolSettingsUpdate, images: dict, db: Session, user: User):
    setting = settings_record(db)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None or key == "chairman_name":
            setattr(setting, key, value.strip() if key == "chairman_name" and isinstance(value, str) else value)
    for field, value in images.items():
        setattr(setting, field, value)
    db.add(SystemLog(user_id=user.user_id, action_type="UPDATE_SYSTEM_SETTINGS", details=f"Updated school configuration; opening month {setting.school_year_start_month}."))
    db.commit()
    return {"message": "Settings updated successfully!", "settings": {**SchoolSettingsResponse.model_validate(setting).model_dump(), **undo_availability(setting)}}


@router.post("/rollover", response_model=RolloverResponse)
@chairman_router.post("/rollover-year", response_model=RolloverResponse)
def rollover_year(payload: RolloverRequest = RolloverRequest(), db: Session = Depends(get_db), user: User = Depends(verify_role(["super-admin"]))):
    return rollover(db, user, payload)


@router.post("/undo-rollover", response_model=RolloverUndoResponse)
@router.post("/revert-school-year", response_model=RolloverUndoResponse)
@chairman_router.post("/undo-rollover", response_model=RolloverUndoResponse)
def revert_year(db: Session = Depends(get_db), user: User = Depends(verify_role(["super-admin"]))):
    return undo_rollover(db, user)

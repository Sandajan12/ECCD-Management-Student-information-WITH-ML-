from datetime import datetime, timezone
from io import BytesIO
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from backend.config.database import get_db
from backend.models import User
from backend.schemas.common import MessageResult
from backend.utils.backups import export_backup, restore_backup
from backend.utils.deps import verify_role

router = APIRouter(prefix="/api/backup", tags=["Backup"])
chairman_router = APIRouter(prefix="/api/chairman/backup", tags=["Backup"])


@router.get("/export")
@chairman_router.get("/export")
def download_backup(db: Session = Depends(get_db), user: User = Depends(verify_role(["super-admin"]))):
    content = export_backup(db)
    timestamp = int(datetime.now(timezone.utc).timestamp())
    return StreamingResponse(BytesIO(content), media_type="application/octet-stream", headers={"Content-Disposition": f'attachment; filename="ames_backup_{timestamp}.enc"'})


@router.post("/restore", response_model=MessageResult)
@chairman_router.post("/restore", response_model=MessageResult)
async def upload_backup(file: UploadFile | None = File(None), backupFile: UploadFile | None = File(None), db: Session = Depends(get_db), user: User = Depends(verify_role(["super-admin"]))):
    source = file or backupFile
    if source is None:
        raise HTTPException(400, "Upload an encrypted backup file.")
    restore_backup(db, await source.read())
    from backend.utils.realtime import disconnect_all
    await disconnect_all()
    return {"message": "System data restored successfully. Current user accounts were preserved; verification codes and trusted devices were cleared."}

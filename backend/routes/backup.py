import os
import json
import base64
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from cryptography.fernet import Fernet
import io
import datetime

from backend.config.database import get_db, engine, Base
from backend.utils.deps import verify_role

router = APIRouter(prefix="/api/backup", tags=["Backup"])

# Generate a consistent key if missing (in prod, use environment variables)
BACKUP_ENCRYPTION_KEY = os.environ.get("BACKUP_ENCRYPTION_KEY", Fernet.generate_key().decode('utf-8'))
if len(BACKUP_ENCRYPTION_KEY) != 44:
    # Ensure standard length for testing if user injected a bad env var
    BACKUP_ENCRYPTION_KEY = Fernet.generate_key().decode('utf-8')

fernet = Fernet(BACKUP_ENCRYPTION_KEY.encode('utf-8'))

class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        return super().default(obj)

@router.get("/export")
def export_backup(
    db: Session = Depends(get_db),
    current_user = Depends(verify_role(["super-admin", "chairman"]))
):
    try:
        # Collect all data
        backup_data = {}
        for table in reversed(Base.metadata.sorted_tables):
            table_name = table.name
            rows = db.execute(table.select()).fetchall()
            
            table_data = []
            for row in rows:
                # Convert row mapping to dict
                row_dict = dict(row._mapping)
                table_data.append(row_dict)
                
            backup_data[table_name] = table_data
            
        json_dump = json.dumps(backup_data, cls=DateTimeEncoder)
        
        # Encrypt
        encrypted = fernet.encrypt(json_dump.encode('utf-8'))
        
        # Stream response
        buffer = io.BytesIO(encrypted)
        buffer.seek(0)
        
        timestamp = int(datetime.datetime.now().timestamp())
        headers = {
            'Content-Disposition': f'attachment; filename="ames_postgres_backup_{timestamp}.enc"'
        }
        
        return StreamingResponse(
            buffer, 
            media_type='application/octet-stream', 
            headers=headers
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup export failed: {str(e)}")

@router.post("/restore")
async def restore_backup(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user = Depends(verify_role(["super-admin", "chairman"]))
):
    try:
        encrypted_data = await file.read()
        
        try:
            decrypted_json = fernet.decrypt(encrypted_data).decode('utf-8')
            backup_data = json.loads(decrypted_json)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid backup file or encryption key mismatch.")
            
        # 1. Clear current database safely (respecting foreign keys by deleting in order)
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
        
        # 2. Insert data in correct dependency order
        for table in Base.metadata.sorted_tables:
            table_name = table.name
            if table_name in backup_data and backup_data[table_name]:
                db.execute(table.insert(), backup_data[table_name])
                
        db.commit()
        
        return {"message": "System restored successfully!"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")

"""Validate before writing; preserve the live account registry on restore."""
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.config.settings import settings
from backend.models import Base, SystemLog, HomeObservationPhoto
from backend.schemas.backup import BackupDocument
from backend.utils.uploads import BACKUP_LIMIT


def cipher() -> Fernet:
    try:
        return Fernet(settings.BACKUP_ENCRYPTION_KEY.encode())
    except ValueError:
        raise HTTPException(500, "Backup encryption key is not configured correctly.") from None


def export_backup(db: Session) -> bytes:
    # ORM metadata includes all evaluator provenance columns; retain default/null
    # fields in the encrypted document as well as explicitly populated values.
    # Current account metadata is email-only; settings carries the Chairman name.
    document = {name: [dict(row) for row in db.execute(table.select()).mappings()] for name, table in Base.metadata.tables.items()
                if name != "auth_refresh_sessions"}
    for photo in document["home_observation_photos"]:
        photo.update(object_key=None, ready=False, delete_pending=False)
    payload = cipher().encrypt(BackupDocument.model_validate(document).model_dump_json(exclude_unset=False).encode())
    if len(payload) > BACKUP_LIMIT:
        raise HTTPException(413, "Backup exceeds the restore upload limit.")
    return payload


def restore_backup(db: Session, payload: bytes, audit_user_id: int | None = None) -> None:
    if len(payload) > BACKUP_LIMIT:
        raise HTTPException(413, "Backup exceeds the restore upload limit.")
    try:
        document = BackupDocument.model_validate_json(cipher().decrypt(payload))
    except (InvalidToken, ValidationError, ValueError):
        raise HTTPException(400, "Invalid backup file, incompatible schema or encryption keys.") from None
    # Historical account-only fields are ignored by UserBackupRow, and account
    # snapshots never overwrite the live email-based registry.
    preserved = {"users", "email_verifications", "auth_refresh_sessions"}
    try:
        # Validate the complete encrypted document before any database reads/writes.
        # Keep tombstones across restore; backup files never restore object keys.
        retained_photos = {r.photo_id for r in db.query(HomeObservationPhoto)}
        db.query(HomeObservationPhoto).filter(HomeObservationPhoto.object_key.isnot(None)).update({"delete_pending": True, "ready": False})
        # No deletion is committed until all replacement data passes FK checks.
        for table in reversed(Base.metadata.sorted_tables):
            if table.name not in ("users", "home_observation_photos"):
                db.execute(table.delete())
        for table in Base.metadata.sorted_tables:
            if table.name in preserved:
                continue
            records = getattr(document, table.name)
            if table.name == "home_observation_photos":
                records = [r.model_copy(update={"object_key": None, "ready": False, "delete_pending": False})
                           for r in records if r.photo_id not in retained_photos]
            if records:
                # Include Pydantic defaults for older backups that predate
                # evaluator provenance, without guessing historical authorship.
                db.execute(table.insert(), [record.model_dump(exclude_unset=False) for record in records])
        # Imported explicit IDs must not collide with the next ORM-generated ID.
        for table in Base.metadata.sorted_tables:
            if table.name in preserved:
                continue
            primary = list(table.primary_key.columns)[0]
            sequence = db.execute(text("SELECT pg_get_serial_sequence(:table, :column)"), {"table": table.name, "column": primary.name}).scalar_one()
            if sequence:
                maximum = db.execute(table.select().with_only_columns(primary).order_by(primary.desc()).limit(1)).scalar_one_or_none()
                # PostgreSQL RESTART is transactional, unlike setval(). The name
                # comes from PostgreSQL's own quoted pg_get_serial_sequence.
                db.execute(text(f"ALTER SEQUENCE {sequence} RESTART WITH {(maximum or 0) + 1}"))
        if audit_user_id is not None:
            db.add(SystemLog(user_id=audit_user_id, action_type="BACKUP_RESTORE", details="Restored school data; live user accounts preserved, verification codes and refresh sessions cleared."))
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(400, "Restore rejected: school records reference missing accounts or contain invalid relationships. Existing data was preserved.") from None

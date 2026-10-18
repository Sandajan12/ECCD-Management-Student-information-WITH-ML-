"""Validate before writing; preserve the live account registry on restore."""
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.config.settings import settings
from backend.models import Base, SystemLog
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
    document = {name: [dict(row) for row in db.execute(table.select()).mappings()] for name, table in Base.metadata.tables.items()}
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
    preserved = {"users", "email_verifications", "user_trusted_devices"}
    try:
        # No deletion is committed until all replacement data passes FK checks.
        for table in reversed(Base.metadata.sorted_tables):
            if table.name != "users":
                db.execute(table.delete())
        for table in Base.metadata.sorted_tables:
            if table.name in preserved:
                continue
            records = getattr(document, table.name)
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
            db.add(SystemLog(user_id=audit_user_id, action_type="BACKUP_RESTORE", details="Restored school data; live user accounts preserved, verification codes and trusted devices cleared."))
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(400, "Restore rejected: school records reference missing accounts or contain invalid relationships. Existing data was preserved.") from None

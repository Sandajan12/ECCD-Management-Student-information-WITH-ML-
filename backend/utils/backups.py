"""Validate before writing; preserve the live account registry on restore."""
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.config.settings import settings
from backend.models import Base
from backend.schemas.backup import BackupDocument


def cipher() -> Fernet:
    try:
        return Fernet(settings.BACKUP_ENCRYPTION_KEY.encode())
    except ValueError:
        raise HTTPException(500, "Backup encryption key is not configured correctly.") from None


def export_backup(db: Session) -> bytes:
    document = {name: [dict(row) for row in db.execute(table.select()).mappings()] for name, table in Base.metadata.tables.items()}
    return cipher().encrypt(BackupDocument.model_validate(document).model_dump_json().encode())


def restore_backup(db: Session, payload: bytes) -> None:
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
                db.execute(table.insert(), [record.model_dump() for record in records])
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
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(400, "Restore rejected: school records reference missing accounts or contain invalid relationships. Existing data was preserved.") from None

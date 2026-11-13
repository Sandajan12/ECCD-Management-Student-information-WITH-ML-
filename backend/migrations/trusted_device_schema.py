"""Frozen pre-020 schema, used only to replay historical migrations."""
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Table, func


def trusted_device_table(metadata):
    table = Table("user_trusted_devices", metadata,
        Column("id", Integer, primary_key=True, autoincrement=True),
        Column("user_id", Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        Column("device_token_hash", String(64), nullable=False),
        Column("user_agent", String(255)),
        Column("expires_at", DateTime(timezone=True), nullable=False),
        Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False))
    Index("idx_user_device", table.c.user_id, table.c.device_token_hash)
    Index("idx_device_token", table.c.device_token_hash)
    Index("idx_device_user_expiry", table.c.user_id, table.c.expires_at)
    return table

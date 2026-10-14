"""Bound reads before decoding or processing uploads."""
from fastapi import HTTPException

JSON_LIMIT = 50 * 1024
EXCEL_LIMIT = 20 * 1024 * 1024
IMAGE_LIMIT = 5 * 1024 * 1024
BACKUP_LIMIT = 50 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


async def read_upload(file, limit: int) -> bytes:
    if file.size is not None and file.size > limit:
        raise HTTPException(413, "Upload is too large.")
    content = await file.read(limit + 1)
    if len(content) > limit:
        raise HTTPException(413, "Upload is too large.")
    return content


async def branding_image(file) -> bytes:
    if file.content_type not in IMAGE_TYPES:
        raise HTTPException(400, "Branding images must be JPEG, PNG or WebP.")
    return await read_upload(file, IMAGE_LIMIT)

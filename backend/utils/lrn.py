"""LRN primitives shared by the data migration and student model.

The envelope matches the legacy iv:tag:ciphertext hexadecimal format.
Never generate replacement keys here: existing records depend on stable keys.
"""

import hashlib
import hmac
import re
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from backend.config.settings import settings


def validate_lrn(value: str) -> str:
    if not isinstance(value, str) or re.fullmatch(r"[0-9]{12}", value) is None:
        raise ValueError("LRN must contain exactly 12 digits")
    return value


def _encryption_key() -> bytes:
    if settings.LRN_ENCRYPTION_KEY is None:
        raise ValueError("Configure LRN_ENCRYPTION_KEY in backend/.env before migrating students")
    return bytes.fromhex(settings.LRN_ENCRYPTION_KEY.get_secret_value())


def encrypt_lrn(value: str) -> str:
    value = validate_lrn(value)
    nonce = secrets.token_bytes(16)
    encrypted = AESGCM(_encryption_key()).encrypt(nonce, value.encode("ascii"), None)
    ciphertext, tag = encrypted[:-16], encrypted[-16:]
    return f"{nonce.hex()}:{tag.hex()}:{ciphertext.hex()}"


def decrypt_lrn(envelope: str) -> str:
    try:
        nonce_hex, tag_hex, ciphertext_hex = envelope.split(":")
        nonce, tag, ciphertext = map(bytes.fromhex, (nonce_hex, tag_hex, ciphertext_hex))
        if len(nonce) != 16 or len(tag) != 16:
            raise ValueError("Invalid LRN envelope")
        value = AESGCM(_encryption_key()).decrypt(nonce, ciphertext + tag, None).decode("ascii")
        return validate_lrn(value)
    except Exception as error:
        raise ValueError("LRN decryption failed; check the existing key and record integrity") from error


def hash_lrn(value: str) -> str:
    value = validate_lrn(value)
    if settings.LRN_HMAC_SECRET is None:
        raise ValueError("Configure LRN_HMAC_SECRET in backend/.env before migrating students")
    secret = settings.LRN_HMAC_SECRET.get_secret_value().encode("utf-8")
    return hmac.new(secret, value.encode("ascii"), hashlib.sha256).hexdigest()


def mask_lrn(last_four: str | None) -> str:
    if last_four is None:
        return "Pending"
    if re.fullmatch(r"[0-9]{4}", last_four) is None:
        raise ValueError("LRN suffix must contain exactly four digits")
    return "\u2022" * 8 + last_four

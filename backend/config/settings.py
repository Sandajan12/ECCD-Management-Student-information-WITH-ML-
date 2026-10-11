import os
import re
from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Dynamically target backend/.env relative to this file (backend/config/settings.py)
CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(CONFIG_DIR)
ENV_FILE_PATH = os.path.join(BACKEND_DIR, ".env")

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ENABLE_OTP: bool = True
    BACKUP_ENCRYPTION_KEY: str
    BACKUP_IV: str
    LRN_ENCRYPTION_KEY: SecretStr | None = None
    LRN_HMAC_SECRET: SecretStr | None = None

    @field_validator("LRN_ENCRYPTION_KEY")
    @classmethod
    def validate_lrn_key(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and not re.fullmatch(r"[0-9a-fA-F]{64}", value.get_secret_value()):
            raise ValueError("LRN_ENCRYPTION_KEY must contain 64 hexadecimal characters")
        return value

    @field_validator("LRN_HMAC_SECRET")
    @classmethod
    def validate_lrn_hmac(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and len(value.get_secret_value()) < 32:
            raise ValueError("LRN_HMAC_SECRET must contain at least 32 characters")
        return value

    model_config = SettingsConfigDict(env_file=ENV_FILE_PATH, extra="ignore")

settings = Settings()

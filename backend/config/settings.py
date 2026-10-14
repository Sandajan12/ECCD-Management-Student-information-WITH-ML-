import os
import re
from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from sqlalchemy.engine import make_url
from urllib.parse import urlsplit
from pydantic_settings import BaseSettings, SettingsConfigDict

# Dynamically target backend/.env relative to this file (backend/config/settings.py)
CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(CONFIG_DIR)
ENV_FILE_PATH = os.path.join(BACKEND_DIR, ".env")

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str = Field(validation_alias=AliasChoices("JWT_SECRET", "SECRET_KEY"))
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ENABLE_OTP: bool = True
    ENVIRONMENT: str = Field(default="production", validation_alias=AliasChoices("ENV", "ENVIRONMENT"))
    FRONTEND_URL: str = ""
    ALLOWED_ORIGINS: str = ""
    DATABASE_SSL_ROOT_CERT: str | None = None
    BACKUP_ENCRYPTION_KEY: str
    BACKUP_IV: str
    LRN_ENCRYPTION_KEY: SecretStr | None = None
    LRN_HMAC_SECRET: SecretStr | None = None

    @property
    def otp_enabled(self) -> bool:
        return self.ENABLE_OTP

    @property
    def production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() == "production"

    @property
    def allowed_origins(self) -> list[str]:
        values = ["http://localhost:5173", "http://127.0.0.1:5173"]
        values.extend(self.FRONTEND_URL.split(","))
        values.extend(self.ALLOWED_ORIGINS.split(","))
        return list(dict.fromkeys(value.strip().rstrip("/") for value in values if value.strip()))

    @model_validator(mode="after")
    def validate_deployment(self):
        for origin in self.allowed_origins:
            parsed = urlsplit(origin)
            if not re.fullmatch(r"https?://(?:[A-Za-z0-9.-]+|\[[A-Fa-f0-9:]+\])(?::[0-9]{1,5})?", origin) or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
                raise ValueError("Allowed origins must be exact HTTP(S) origins")
            if parsed.port is not None and not 1 <= parsed.port <= 65535:
                raise ValueError("Allowed origin port must be between 1 and 65535")
            if self.production and origin not in ("http://localhost:5173", "http://127.0.0.1:5173") and parsed.scheme != "https":
                raise ValueError("Production frontend origins must use HTTPS")
        if self.production:
            secret = self.SECRET_KEY
            if len(secret) < 32 or len(set(secret)) < 8 or any(word in secret.lower() for word in ("change-me", "changeme", "your-secret", "default-secret")):
                raise ValueError("Production JWT_SECRET must be a strong secret of at least 32 characters")
            url = make_url(self.DATABASE_URL)
            if url.get_backend_name() != "postgresql" or url.query.get("sslmode") != "verify-full" or not (url.query.get("sslrootcert") or self.DATABASE_SSL_ROOT_CERT):
                raise ValueError("Production database requires sslmode=verify-full and a trusted sslrootcert")
        return self

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

    model_config = SettingsConfigDict(env_file=ENV_FILE_PATH, extra="ignore", populate_by_name=True)

settings = Settings()

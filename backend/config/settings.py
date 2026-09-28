import os
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
    BACKUP_ENCRYPTION_KEY: str
    BACKUP_IV: str

    model_config = SettingsConfigDict(env_file=ENV_FILE_PATH, extra="ignore")

settings = Settings()

"""
Application configuration – reads from .env using pydantic-settings.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    APP_NAME: str = "LegalDoc AI"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "sqlite:///./legaldoc.db"

    # Auth – JWT
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Auth – Cookie settings (configure for production)
    COOKIE_SECURE: bool = False        # True in production (HTTPS)
    COOKIE_SAMESITE: str = "lax"       # "strict" in production if same-origin
    COOKIE_DOMAIN: str = ""            # Leave empty for localhost; set domain in prod

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""

    # AI
    GEMINI_API_KEY: str = ""

    # CORS
    FRONTEND_URL: str = "http://localhost:5173"


settings = Settings()

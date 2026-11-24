"""
Application configuration – reads from .env using pydantic-settings.
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_ENV_PATH = _BACKEND_DIR / ".env"
_DEFAULT_DB_PATH = (_BACKEND_DIR / "legaldoc.db").as_posix()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[str(_ENV_PATH), ".env"],
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    APP_NAME: str = "LegalDoc AI"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = f"sqlite:///{_DEFAULT_DB_PATH}"

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

    # AI / LLM (Groq via OpenAI-compatible API)
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    GROQ_TIMEOUT_SECONDS: int = 45
    GROQ_MAX_RETRIES: int = 2

    # Legacy Gemini settings (retained for backward compatibility during migration)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.8-flash"
    GEMINI_TIMEOUT_SECONDS: int = 30
    RAG_TOP_K: int = 15

    # CORS
    FRONTEND_URL: str = "http://localhost:5173"


settings = Settings()

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Read from backend/.env. Secrets live only there, never in code or the browser."""

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str
    test_database_url: str | None = None

    # Empty means "use the mock service". See docs/decisions.md.
    google_maps_api_key: str = ""
    deepseek_api_key: str = ""
    meta_app_secret: str = ""
    instagram_user_id: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()

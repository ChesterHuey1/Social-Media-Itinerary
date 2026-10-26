from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Read from backend/.env. Secrets live only there, never in code or the browser."""

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str
    test_database_url: str | None = None

    # Login. Set with: uv run python -m pinpoint.auth set-password
    app_password_hash: str = ""
    session_secret: str = ""
    # True once the site is served over HTTPS (the Instagram webhook tunnel), so the cookie never goes over plain HTTP.
    cookie_secure: bool = False

    # Empty means "use the mock service". See docs/decisions.md.
    google_maps_api_key: str = ""
    deepseek_api_key: str = ""
    meta_app_secret: str = ""
    instagram_user_id: str = ""

    # Named in the scraper's user agent so site owners can reach whoever runs it. Your choice to fill in.
    scraper_contact: str = ""

    # Reddit's Data API: a free "script" app at https://www.reddit.com/prefs/apps. Empty skips Reddit.
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_username: str = ""

    # Brave Search API, used to find travel blogs. Empty skips blogs.
    brave_search_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()

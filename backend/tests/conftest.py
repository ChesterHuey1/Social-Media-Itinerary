"""Tests run against TEST_DATABASE_URL. The schema is rebuilt from the migrations once per run,
which also proves the migrations work, and every test runs in a transaction that is rolled back."""

from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session

from pinpoint import auth
from pinpoint.config import BACKEND_DIR, get_settings
from pinpoint.db import get_session
from pinpoint.main import app
from pinpoint.seed import seed_demo


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    url = get_settings().test_database_url
    if not url:
        pytest.exit("Set TEST_DATABASE_URL in backend/.env to run the tests.")
    engine = create_engine(url)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    config = Config(BACKEND_DIR / "alembic.ini")
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    command.upgrade(config, "head")
    yield engine
    engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    with engine.connect() as conn:
        outer = conn.begin()
        session = Session(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
        seed_demo(session)
        # Commit releases the savepoint into the outer transaction, so a rollback after a
        # rejected edit undoes only that edit, never the seed.
        session.commit()
        yield session
        session.close()
        outer.rollback()


TEST_PASSWORD = "correct horse battery"


@pytest.fixture(scope="session", autouse=True)
def login_settings() -> Iterator[None]:
    """A known password and session secret for every test, whatever backend/.env holds."""
    settings = get_settings()
    saved = (settings.app_password_hash, settings.session_secret)
    settings.app_password_hash = auth.hash_password(TEST_PASSWORD)
    settings.session_secret = "test-secret"
    yield
    settings.app_password_hash, settings.session_secret = saved


@pytest.fixture
def anon_client(session: Session) -> Iterator[TestClient]:
    """Not signed in."""
    auth._failures.clear()
    app.dependency_overrides[get_session] = lambda: session
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def client(anon_client: TestClient) -> TestClient:
    """Signed in."""
    assert anon_client.post("/api/auth/login", json={"password": TEST_PASSWORD}).status_code == 204
    return anon_client

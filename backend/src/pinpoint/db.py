from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from pinpoint.config import get_settings


@lru_cache
def get_engine() -> Engine:
    return create_engine(get_settings().database_url)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request, committed by the caller."""
    with sessionmaker(get_engine(), expire_on_commit=False)() as session:
        yield session

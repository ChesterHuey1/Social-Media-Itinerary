"""Alembic runs migrations against DATABASE_URL from backend/.env.
The tests pass another URL through the config's "sqlalchemy.url" option."""

from alembic import context
from sqlalchemy import create_engine

from pinpoint.config import get_settings
from pinpoint.models import Base

config = context.config
target_metadata = Base.metadata


def database_url() -> str:
    return config.get_main_option("sqlalchemy.url") or get_settings().database_url


if context.is_offline_mode():
    context.configure(url=database_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    with create_engine(database_url()).connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

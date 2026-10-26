"""uv run python -m pinpoint.seed  — loads the sample trip into the database in DATABASE_URL."""

from sqlalchemy.orm import Session

from pinpoint.db import get_engine
from pinpoint.seed import seed_demo

with Session(get_engine()) as session:
    seed_demo(session)
    session.commit()
print("Seeded the sample trip.")

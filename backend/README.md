# Pinpoint backend

FastAPI + Postgres. One API for the website (and later the Instagram bot).

## Setup (once)

1. Install [uv](https://docs.astral.sh/uv/) and PostgreSQL 17.
2. Create the `pinpoint` role and the `pinpoint` and `pinpoint_test` databases.
3. Copy `.env.example` to `.env` and fill in the database password. Leave the API keys empty to use mocks.

```sh
uv sync
uv run alembic upgrade head      # create the tables
uv run python -m pinpoint.seed   # load the sample Tokyo and Kyoto trip (safe to rerun)
uv run python -m pinpoint.auth set-password   # the password the website asks for; only its hash goes in .env
```

Run `set-password` again to change the password. Changing `SESSION_SECRET` in `.env` signs every browser out.

## Run

```sh
uv run uvicorn pinpoint.main:app --port 8000
```

The frontend's dev server forwards `/api` to port 8000.

## Test and lint

```sh
uv run pytest        # rebuilds pinpoint_test from the migrations, then runs every test
uv run ruff check src tests && uv run ruff format --check src tests
```

## Layout

- `src/pinpoint/models.py`: the tables. `docs/decisions.md` explains where they differ from the spec.
- `src/pinpoint/schemas.py`: the API shapes, mirroring `frontend/src/domain/types.ts`.
- `src/pinpoint/trips/`: reading a trip (`read.py`) and saving edits (`edits.py`).
- `src/pinpoint/seed/demo_trip.json`: the sample trip, the only copy of it.
- `migrations/`: Alembic. After changing `models.py`, run `uv run alembic revision --autogenerate -m "what changed"` and review the file.

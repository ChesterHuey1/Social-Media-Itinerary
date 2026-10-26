from fastapi import Depends, FastAPI

from pinpoint.auth import require_session
from pinpoint.auth.api import router as auth_router
from pinpoint.budget.api import router as budget_router
from pinpoint.plan.api import router as plan_router
from pinpoint.setup.api import router as setup_router
from pinpoint.trips.api import router as trips_router

app = FastAPI(title="Pinpoint")
app.include_router(auth_router)
# Everything else needs a session. tests/test_auth.py fails if a route under /api is left open.
signed_in = [Depends(require_session)]
app.include_router(trips_router, dependencies=signed_in)
app.include_router(plan_router, dependencies=signed_in)
app.include_router(budget_router, dependencies=signed_in)
app.include_router(setup_router, dependencies=signed_in)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

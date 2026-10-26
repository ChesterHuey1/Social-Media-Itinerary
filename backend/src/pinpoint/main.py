from fastapi import FastAPI

from pinpoint.plan.api import router as plan_router
from pinpoint.trips.api import router as trips_router

app = FastAPI(title="Pinpoint")
app.include_router(trips_router)
app.include_router(plan_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

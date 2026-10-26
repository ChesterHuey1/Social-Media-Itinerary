from fastapi import FastAPI

from pinpoint.trips.api import router as trips_router

app = FastAPI(title="Pinpoint")
app.include_router(trips_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

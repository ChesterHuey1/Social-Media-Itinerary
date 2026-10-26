from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from pinpoint import models, schemas
from pinpoint.db import get_session
from pinpoint.plan.service import DayNotFound, optimize_trip_day
from pinpoint.trips.read import load_trip

router = APIRouter(prefix="/api/trips", tags=["plan"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.post(
    "/{trip_id}/days/{day_number}/optimize", response_model=schemas.OptimizeResult, response_model_by_alias=True
)
def optimize(trip_id: str, day_number: int, session: SessionDep) -> schemas.OptimizeResult:
    """Reorders the day so every stop is open when you arrive, with the least travel. Locked stops stay put."""
    if session.get(models.Trip, trip_id) is None:
        raise HTTPException(404, f"No trip {trip_id}")
    try:
        outcome = optimize_trip_day(session, trip_id, day_number)
        session.commit()
    except DayNotFound as e:
        raise HTTPException(404, str(e)) from None
    return schemas.OptimizeResult(
        trip=load_trip(session, trip_id),
        previous_stops=outcome.previous_stops,
        dropped=[schemas.DroppedStop(place_id=d.place_id, reason=d.reason) for d in outcome.dropped],
    )

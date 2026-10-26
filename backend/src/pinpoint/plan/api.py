from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from pinpoint import models, schemas
from pinpoint.db import get_session
from pinpoint.plan.build_service import BuildOutcome, TripNotFound, build_trip, save_plan
from pinpoint.plan.service import DayNotFound, optimize_trip_day
from pinpoint.trips.edits import EditRejected
from pinpoint.trips.read import load_trip

router = APIRouter(prefix="/api/trips", tags=["plan"])

SessionDep = Annotated[Session, Depends(get_session)]


def _result(session: Session, trip_id: str, outcome: BuildOutcome) -> schemas.BuildResult:
    return schemas.BuildResult(
        trip=load_trip(session, trip_id),
        previous=schemas.PlanSnapshot(
            days=[schemas.DayStops(day_number=n, stops=stops) for n, stops in outcome.previous_days],
            backlog=outcome.previous_backlog,
        ),
        placed=outcome.placed,
        backlogged=[schemas.DroppedStop(place_id=d.place_id, reason=d.reason) for d in outcome.backlogged],
    )


@router.post("/{trip_id}/build", response_model=schemas.BuildResult, response_model_by_alias=True)
def build(trip_id: str, request: schemas.BuildRequest, session: SessionDep) -> schemas.BuildResult:
    """Puts the chosen saved places onto days by city and area, then plans each day. With a previewed plan,
    saves that plan exactly instead."""
    try:
        if request.plan is None:
            outcome = build_trip(session, trip_id, request.included_place_ids)
        else:
            outcome = save_plan(session, trip_id, request.included_place_ids, request.plan)
        session.commit()
    except TripNotFound:
        raise HTTPException(404, f"No trip {trip_id}") from None
    except EditRejected as e:
        session.rollback()
        raise HTTPException(409, str(e)) from None
    return _result(session, trip_id, outcome)


@router.post("/{trip_id}/build/preview", response_model=schemas.BuildResult, response_model_by_alias=True)
def preview(trip_id: str, request: schemas.BuildRequest, session: SessionDep) -> schemas.BuildResult:
    """What Build itinerary would do, without saving it: the build runs, the answer is read, then it is rolled back."""
    try:
        outcome = build_trip(session, trip_id, request.included_place_ids)
        result = _result(session, trip_id, outcome)
    except TripNotFound:
        raise HTTPException(404, f"No trip {trip_id}") from None
    finally:
        session.rollback()
    return result


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

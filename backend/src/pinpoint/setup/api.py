from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from pinpoint import models, schemas
from pinpoint.db import get_session
from pinpoint.setup.service import SetupRejected, apply_setup
from pinpoint.trips.read import load_trip

router = APIRouter(prefix="/api/trips", tags=["setup"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.post("/{trip_id}/setup", response_model=schemas.Trip, response_model_by_alias=True)
def post_setup(trip_id: str, change: Annotated[schemas.SetupChange, Body()], session: SessionDep) -> schemas.Trip:
    """Saves one Trip setup change and answers with the trip as stored, days worked out again."""
    trip = session.get(models.Trip, trip_id)
    if trip is None:
        raise HTTPException(404, f"No trip {trip_id}")
    try:
        apply_setup(session, trip, change)
        session.commit()
    except SetupRejected as e:
        session.rollback()
        raise HTTPException(409, str(e)) from None
    return load_trip(session, trip_id)

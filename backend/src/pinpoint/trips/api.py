from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from pinpoint import models, schemas
from pinpoint.db import get_session
from pinpoint.trips.edits import EditRejected, apply_edit
from pinpoint.trips.read import TripNotFound, load_trip

router = APIRouter(prefix="/api/trips", tags=["trips"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/{trip_id}", response_model=schemas.Trip, response_model_by_alias=True)
def get_trip(trip_id: str, session: SessionDep) -> schemas.Trip:
    try:
        return load_trip(session, trip_id)
    except TripNotFound:
        raise HTTPException(404, f"No trip {trip_id}") from None


@router.post("/{trip_id}/edits", response_model=schemas.Trip, response_model_by_alias=True)
def post_edit(trip_id: str, edit: Annotated[schemas.TripEdit, Body()], session: SessionDep) -> schemas.Trip:
    """Saves one edit and returns the trip as stored, so the browser can match it."""
    if session.get(models.Trip, trip_id) is None:
        raise HTTPException(404, f"No trip {trip_id}")
    try:
        apply_edit(session, trip_id, edit)
        session.commit()
    except EditRejected as e:
        session.rollback()
        raise HTTPException(409, str(e)) from None
    return load_trip(session, trip_id)

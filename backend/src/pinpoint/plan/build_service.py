"""Build itinerary: puts the trip's chosen saved places onto days, then plans each day.

Edits already made are kept: a place already on the trip keeps its stop (title, color, comments, a time
the user set), and locked stops stay on their day. Places that fit nowhere go to the backlog with a reason.
Returns the trip's days and backlog as they were, so the browser can offer Undo.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from pinpoint import models, schemas
from pinpoint.plan.build import DayToFill, PlaceToPlan, assign_days
from pinpoint.plan.defaults import STOP_COLOR_CYCLE, default_stay_minutes
from pinpoint.plan.service import Dropped, optimize_trip_day
from pinpoint.trips.read import stop_schema


class TripNotFound(Exception):
    pass


@dataclass(frozen=True)
class BuildOutcome:
    previous_days: list[tuple[int, list[schemas.Stop]]]
    previous_backlog: list[schemas.BacklogItem]
    placed: int
    backlogged: list[Dropped]


def _add_to_backlog(session: Session, trip_id: str, place_id: str, reason: str) -> None:
    first = session.scalar(select(func.min(models.BacklogItem.position)).where(models.BacklogItem.trip_id == trip_id))
    existing = session.scalar(
        select(models.BacklogItem).where(models.BacklogItem.trip_id == trip_id, models.BacklogItem.place_id == place_id)
    )
    if existing:
        existing.reason = reason
    else:
        session.add(models.BacklogItem(trip_id=trip_id, place_id=place_id, reason=reason, position=(first or 0) - 1))
    session.flush()


def build_trip(session: Session, trip_id: str, included_place_ids: list[str]) -> BuildOutcome:
    trip = session.get(models.Trip, trip_id)
    if trip is None:
        raise TripNotFound(trip_id)
    days = list(trip.days)
    previous_days = [(d.number, [stop_schema(s) for s in d.stops]) for d in days]
    previous_backlog = [schemas.BacklogItem(place_id=b.place_id, reason=b.reason) for b in trip.backlog]
    included = list(dict.fromkeys(included_place_ids))

    # The saved list remembers which places this trip uses.
    for saved in session.scalars(select(models.SavedPlace).where(models.SavedPlace.user_id == trip.user_id)):
        if saved.place_id in included:
            saved.status = "in_trip"
        elif saved.status == "in_trip":
            saved.status = "new"

    existing = {s.place_id: s for d in days for s in d.stops}
    locked = {s.place_id for d in days for s in d.stops if s.locked_at_min is not None}
    places = {p.id: p for p in session.scalars(select(models.Place).where(models.Place.id.in_(included)))}
    stays = {s.id: s for s in trip.stays}

    to_plan = [
        PlaceToPlan(
            p.id,
            p.city,
            p.lat,
            p.lng,
            existing[p.id].stay_minutes if p.id in existing else default_stay_minutes(p.objectives),
        )
        for pid in included
        if pid not in locked and (p := places.get(pid))
    ]
    day_slots = [
        DayToFill(
            d.number,
            stays[d.stay_id].city,
            d.end_min - d.start_min - sum(s.stay_minutes for s in d.stops if s.locked_at_min is not None),
        )
        for d in days
    ]
    assignment = assign_days(to_plan, day_slots)

    for day in days:
        stops = [s for s in day.stops if s.locked_at_min is not None]
        for place_id in assignment.days[day.number]:
            stop = existing.get(place_id) or models.Stop(
                id=str(uuid.uuid4()),
                place_id=place_id,
                title=None,
                color=STOP_COLOR_CYCLE[len(stops) % len(STOP_COLOR_CYCLE)],
                objectives=list(places[place_id].objectives),
                stay_minutes=default_stay_minutes(places[place_id].objectives),
                stay_source="estimate",
                locked_at_min=None,
            )
            stops.append(stop)
        for position, stop in enumerate(stops):
            stop.position = position
        day.stops = stops
    session.flush()

    # Places now on a day leave the backlog; places with no day in their city join it.
    on_days = {s.place_id for d in days for s in d.stops}
    for item in list(trip.backlog):
        if item.place_id in on_days:
            session.delete(item)
    session.flush()
    backlogged = []
    for place_id, reason in assignment.unplaced.items():
        _add_to_backlog(session, trip_id, place_id, reason)
        backlogged.append(Dropped(place_id, reason))

    # Each day is then ordered by the optimizer, which sends what can't fit to the backlog.
    for day in days:
        backlogged.extend(optimize_trip_day(session, trip_id, day.number).dropped)
    session.flush()

    placed = sum(len(d.stops) for d in days)
    return BuildOutcome(previous_days, previous_backlog, placed, backlogged)

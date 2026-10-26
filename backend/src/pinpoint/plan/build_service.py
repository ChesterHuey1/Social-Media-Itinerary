"""Build itinerary: puts the trip's chosen saved places onto days, then plans each day.

- First build (no day has stops yet): places are split by city and area across the days (build.assign_days).
- Rebuild (the trip already has stops): every stop stays on its day. Only places not on a day yet, new saves
  and backlog places, are added, each to the nearest day in its city with room (build.add_to_days). Only days
  that changed are planned again. Unchecked places leave the trip either way.

Edits already made are kept: a place already on the trip keeps its stop (title, color, comments, a time the
user set), and locked stops stay on their day. Places that fit nowhere go to the backlog with a reason.
Returns the trip's days and backlog as they were, so the browser can offer Undo.

The solver stops at a time limit, so two runs can differ. The browser previews a rebuild (the API rolls the
preview back) and then saves exactly the plan it showed with `save_plan`.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from pinpoint import models, schemas
from pinpoint.plan.build import DayToFill, PlaceToPlan, add_to_days, assign_days
from pinpoint.plan.defaults import STOP_COLOR_CYCLE, default_stay_minutes
from pinpoint.plan.service import Dropped, opening_windows, optimize_trip_day
from pinpoint.trips.edits import apply_edit
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


def _trip(session: Session, trip_id: str) -> models.Trip:
    trip = session.get(models.Trip, trip_id)
    if trip is None:
        raise TripNotFound(trip_id)
    return trip


def _snapshot(trip: models.Trip) -> tuple[list[tuple[int, list[schemas.Stop]]], list[schemas.BacklogItem]]:
    return (
        [(d.number, [stop_schema(s) for s in d.stops]) for d in trip.days],
        [schemas.BacklogItem(place_id=b.place_id, reason=b.reason) for b in trip.backlog],
    )


def _use_saved(session: Session, trip: models.Trip, included_place_ids: list[str]) -> list[str]:
    """The places this build uses, and the saved list updated to match. Locked stops, and stops and backlog places
    whose place isn't in the saved list (so had no checkbox), stay included. Unchecked saved places were seen and
    left out, so they stop counting as new."""
    saved = list(session.scalars(select(models.SavedPlace).where(models.SavedPlace.user_id == trip.user_id)))
    saved_ids = {sp.place_id for sp in saved}
    staying = [
        s.place_id for d in trip.days for s in d.stops if s.place_id not in saved_ids or s.locked_at_min is not None
    ] + [b.place_id for b in trip.backlog if b.place_id not in saved_ids]
    included = list(dict.fromkeys([*included_place_ids, *staying]))
    for sp in saved:
        sp.status = "in_trip" if sp.place_id in included else "dismissed"
    return included


def _to_plan(place: models.Place, stay_min: int) -> PlaceToPlan:
    windows = opening_windows(place)
    return PlaceToPlan(
        place.id,
        place.city,
        place.lat,
        place.lng,
        stay_min,
        None if windows is None else tuple((w.open_min, w.close_min) for w in windows),
    )


def _new_stop(place: models.Place, count: int) -> models.Stop:
    return models.Stop(
        id=str(uuid.uuid4()),
        place_id=place.id,
        title=None,
        color=STOP_COLOR_CYCLE[count % len(STOP_COLOR_CYCLE)],
        objectives=list(place.objectives),
        stay_minutes=default_stay_minutes(place.objectives),
        stay_source="estimate",
        locked_at_min=None,
    )


def _set_stops(day: models.Day, stops: list[models.Stop]) -> None:
    for position, stop in enumerate(stops):
        stop.position = position
    day.stops = stops


def _first_build(
    trip: models.Trip, included: list[str], places: dict[str, models.Place]
) -> tuple[set[int], dict[str, str]]:
    days = list(trip.days)
    stays = {s.id: s for s in trip.stays}
    existing = {s.place_id: s for d in days for s in d.stops}
    locked = {s.place_id for d in days for s in d.stops if s.locked_at_min is not None}
    to_plan = [
        _to_plan(p, existing[pid].stay_minutes if pid in existing else default_stay_minutes(p.objectives))
        for pid in included
        if pid not in locked and (p := places.get(pid))
    ]
    day_slots = [
        DayToFill(
            d.number,
            stays[d.stay_id].city,
            d.end_min - d.start_min - sum(s.stay_minutes for s in d.stops if s.locked_at_min is not None),
            d.start_min,
            d.end_min,
        )
        for d in days
    ]
    assignment = assign_days(to_plan, day_slots)
    for day in days:
        stops = [s for s in day.stops if s.locked_at_min is not None]
        for place_id in assignment.days[day.number]:
            stops.append(existing.get(place_id) or _new_stop(places[place_id], len(stops)))
        _set_stops(day, stops)
    return {d.number for d in days}, assignment.unplaced


def _rebuild(
    trip: models.Trip, included: list[str], places: dict[str, models.Place]
) -> tuple[set[int], dict[str, str]]:
    days = list(trip.days)
    stays = {s.id: s for s in trip.stays}
    keep = set(included)
    kept = {d.number: [s for s in d.stops if s.place_id in keep] for d in days}
    on_days = {s.place_id for stops in kept.values() for s in stops}
    to_add = [
        _to_plan(p, default_stay_minutes(p.objectives))
        for pid in included
        if pid not in on_days and (p := places.get(pid))
    ]
    day_slots = [
        DayToFill(d.number, stays[d.stay_id].city, d.end_min - d.start_min, d.start_min, d.end_min) for d in days
    ]
    kept_plan = {n: [_to_plan(places[s.place_id], s.stay_minutes) for s in stops] for n, stops in kept.items()}
    assignment = add_to_days(to_add, day_slots, kept_plan)

    changed = set()
    for day in days:
        stops = list(kept[day.number])
        for place_id in assignment.days[day.number]:
            stops.append(_new_stop(places[place_id], len(stops)))
        if [s.id for s in stops] != [s.id for s in day.stops]:
            changed.add(day.number)
        _set_stops(day, stops)
    return changed, assignment.unplaced


def build_trip(session: Session, trip_id: str, included_place_ids: list[str]) -> BuildOutcome:
    trip = _trip(session, trip_id)
    previous_days, previous_backlog = _snapshot(trip)
    included = _use_saved(session, trip, included_place_ids)
    on_trip = {s.place_id for d in trip.days for s in d.stops}
    places = {p.id: p for p in session.scalars(select(models.Place).where(models.Place.id.in_([*included, *on_trip])))}

    first = not on_trip
    changed, unplaced = _first_build(trip, included, places) if first else _rebuild(trip, included, places)
    session.flush()

    # Places now on a day leave the backlog; places that fit no day join it.
    on_days = {s.place_id for d in trip.days for s in d.stops}
    for item in list(trip.backlog):
        if item.place_id in on_days:
            session.delete(item)
    session.flush()
    backlogged = []
    for place_id, reason in unplaced.items():
        _add_to_backlog(session, trip_id, place_id, reason)
        backlogged.append(Dropped(place_id, reason))

    # Each changed day is then ordered by the optimizer, which sends what can't fit to the backlog.
    for number in sorted(changed):
        backlogged.extend(optimize_trip_day(session, trip_id, number).dropped)
    session.flush()

    placed = sum(len(d.stops) for d in trip.days)
    return BuildOutcome(previous_days, previous_backlog, placed, backlogged)


def save_plan(
    session: Session, trip_id: str, included_place_ids: list[str], plan: schemas.PlanSnapshot
) -> BuildOutcome:
    """Saves a plan the browser previewed: exactly its days and backlog, and the saved list as a build would."""
    trip = _trip(session, trip_id)
    previous_days, previous_backlog = _snapshot(trip)
    _use_saved(session, trip, included_place_ids)
    apply_edit(session, trip_id, schemas.RestorePlan(type="restorePlan", days=plan.days, backlog=plan.backlog))
    session.flush()
    before = {b.place_id for b in previous_backlog}
    placed = sum(len(d.stops) for d in plan.days)
    return BuildOutcome(
        previous_days,
        previous_backlog,
        placed,
        [Dropped(b.place_id, b.reason) for b in plan.backlog if b.place_id not in before],
    )

"""Runs Optimize route for one stored day: builds the solver's inputs, applies its order, and moves dropped
stops to the backlog with a reason. Returns the day's previous stops so the browser can offer Undo."""

from dataclasses import dataclass, replace
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from pinpoint import models, schemas
from pinpoint.plan.optimize import StopInput, Window, assign_meals, optimize_day
from pinpoint.plan.travel import Node, Travel, estimate
from pinpoint.trips.read import stop_schema

# Used when no source has a place's hours (spec: "assume 10 AM–6 PM and mark the card").
ASSUMED_WINDOWS = [Window(600, 1080)]


class DayNotFound(Exception):
    pass


@dataclass(frozen=True)
class Dropped:
    place_id: str
    reason: str


@dataclass(frozen=True)
class OptimizeOutcome:
    previous_stops: list[schemas.Stop]
    dropped: list[Dropped]


def _windows(place: models.Place) -> list[Window] | None:
    match place.hours.get("kind"):
        case "always":
            return None
        case "windows":
            return [Window(w["openMin"], w["closeMin"]) for w in place.hours["windows"]]
        case _:
            return ASSUMED_WINDOWS


def _duration(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    return f"{m} m" if h == 0 else f"{h} h" if m == 0 else f"{h} h {m} m"


def _drop_reason(stop: models.Stop, windows: list[Window] | None, day_number: int) -> str:
    if windows == []:
        return "Closed on this date."
    if stop.locked_at_min is not None:
        return "Its locked time can't be reached along with the other stops."
    if windows:
        longest = max(w.close_min - w.open_min for w in windows)
        if stop.stay_minutes > longest:
            return f"Needs {_duration(stop.stay_minutes)}. It's open {_duration(longest)} at most."
    return f"Didn't fit Day {day_number} with every stop open when you arrive."


def optimize_trip_day(session: Session, trip_id: str, day_number: int) -> OptimizeOutcome:
    day = session.scalar(select(models.Day).where(models.Day.trip_id == trip_id, models.Day.number == day_number))
    if day is None:
        raise DayNotFound(f"Day {day_number} is not on trip {trip_id}")
    stay = session.get(models.Stay, day.stay_id)
    stops = list(day.stops)
    previous = [stop_schema(s) for s in stops]
    places = {
        p.id: p for p in session.scalars(select(models.Place).where(models.Place.id.in_([s.place_id for s in stops])))
    }

    nodes = [Node(stay.id, stay.lat, stay.lng)] + [
        Node(s.place_id, places[s.place_id].lat, places[s.place_id].lng) for s in stops
    ]
    ids = {n.id for n in nodes}
    known = {
        (leg.from_node, leg.to_node): Travel(leg.mode, leg.minutes, leg.distance_m, leg.source)
        for leg in session.scalars(select(models.Leg).where(models.Leg.from_node.in_(ids), models.Leg.to_node.in_(ids)))
    }

    def travel(i: int, j: int) -> Travel:
        key = (nodes[i].id, nodes[j].id)
        if key not in known:
            known[key] = estimate(nodes[i], nodes[j])
        return known[key]

    windows = {s.id: _windows(places[s.place_id]) for s in stops}
    inputs = [
        StopInput(s.id, s.stay_minutes, windows[s.id], places[s.place_id].last_entry_min, s.locked_at_min)
        for s in stops
    ]
    eat_stops = [i for i, s in zip(inputs, stops, strict=True) if "eat" in s.objectives and s.locked_at_min is None]
    meals = assign_meals(eat_stops, day.start_min, day.end_min)
    plan = optimize_day(
        [replace(i, meal=meals.get(i.id)) for i in inputs],
        lambda i, j: travel(i, j).minutes,
        day.start_min,
        day.end_min,
    )

    by_id = {s.id: s for s in stops}
    for position, stop_id in enumerate(plan.order):
        by_id[stop_id].position = position

    dropped = []
    first = (
        session.scalar(select(func.min(models.BacklogItem.position)).where(models.BacklogItem.trip_id == trip_id)) or 0
    )
    for stop_id in plan.dropped:
        stop = by_id[stop_id]
        reason = _drop_reason(stop, windows[stop_id], day_number)
        dropped.append(Dropped(stop.place_id, reason))
        first -= 1
        session.add(models.BacklogItem(trip_id=trip_id, place_id=stop.place_id, reason=reason, position=first))
        session.delete(stop)

    # Save the estimated legs the new order uses, so the browser shows the same travel times.
    route = [nodes[0].id] + [by_id[i].place_id for i in plan.order] + [nodes[0].id]
    now = datetime.now(UTC)
    for a, b in zip(route, route[1:], strict=False):
        t = known.get((a, b))
        if t and t.source == "estimate" and session.get(models.Leg, (a, b)) is None:
            session.add(
                models.Leg(
                    from_node=a,
                    to_node=b,
                    mode=t.mode,
                    minutes=t.minutes,
                    distance_m=t.distance_m,
                    source="estimate",
                    fetched_at=now,
                )
            )
    return OptimizeOutcome(previous, dropped)

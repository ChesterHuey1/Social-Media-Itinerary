"""Applies one TripEdit to the database. The same edits as frontend/src/domain/tripEdits.ts;
the browser applies them right away for speed and this is the copy that is saved.
tests/test_edits.py holds both to the same behavior."""

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from pinpoint import models, schemas


class EditRejected(Exception):
    """The edit names something that does not exist on this trip."""


def _day(session: Session, trip_id: str, number: int) -> models.Day:
    day = session.scalar(select(models.Day).where(models.Day.trip_id == trip_id, models.Day.number == number))
    if day is None:
        raise EditRejected(f"Day {number} is not on trip {trip_id}")
    return day


def _stop(day: models.Day, stop_id: str) -> models.Stop:
    stop = next((s for s in day.stops if s.id == stop_id), None)
    if stop is None:
        raise EditRejected(f"Stop {stop_id} is not on day {day.number}")
    return stop


def _renumber(day: models.Day, stops: list[models.Stop]) -> None:
    for position, stop in enumerate(stops):
        stop.position = position
    day.stops = stops


def _set_day_stops(day: models.Day, wanted: list[schemas.Stop], pool: dict[str, models.Stop]) -> None:
    """Makes the day's stops exactly `wanted`, reusing rows from `pool` (with their comments) where they exist."""
    stops = []
    for position, new in enumerate(wanted):
        stop = pool.pop(new.id, None) or models.Stop(
            id=new.id,
            place_id=new.place_id,
            comments=[
                models.Comment(id=c.id, body=c.body, created_at=date.fromisoformat(c.created_at)) for c in new.comments
            ],
        )
        stop.position = position
        stop.title, stop.color, stop.objectives = new.title, new.color, new.objectives
        stop.stay_minutes, stop.stay_source = new.stay.minutes, new.stay.source
        stop.locked_at_min = new.locked_at_min
        stops.append(stop)
    day.stops = stops


def apply_edit(session: Session, trip_id: str, edit: schemas.TripEdit) -> None:
    match edit:
        case schemas.MoveStop(day_number=n, from_index=src, to_index=dst):
            day = _day(session, trip_id, n)
            stops = list(day.stops)
            if src == dst or not (0 <= src < len(stops)) or not (0 <= dst < len(stops)):
                return
            stops.insert(dst, stops.pop(src))
            _renumber(day, stops)

        case schemas.UpdateStop(day_number=n, stop_id=stop_id, changes=changes):
            stop = _stop(_day(session, trip_id, n), stop_id)
            # Only fields the client sent. A sent null means "clear": no custom title, unlocked.
            sent = changes.model_fields_set
            if "title" in sent:
                stop.title = changes.title
            if "color" in sent and changes.color is not None:
                stop.color = changes.color
            if "objectives" in sent and changes.objectives is not None:
                stop.objectives = changes.objectives
            if "stay" in sent and changes.stay is not None:
                stop.stay_minutes = changes.stay.minutes
                stop.stay_source = changes.stay.source
            if "locked_at_min" in sent:
                stop.locked_at_min = changes.locked_at_min

        case schemas.AddComment(day_number=n, stop_id=stop_id, comment_id=comment_id, body=body, created_at=created):
            stop = _stop(_day(session, trip_id, n), stop_id)
            if body.strip():
                stop.comments.append(
                    models.Comment(id=comment_id, body=body.strip(), created_at=date.fromisoformat(created))
                )

        case schemas.MoveToBacklog(day_number=n, stop_id=stop_id):
            day = _day(session, trip_id, n)
            stop = _stop(day, stop_id)
            _renumber(day, [s for s in day.stops if s is not stop])
            first = session.scalar(
                select(func.min(models.BacklogItem.position)).where(models.BacklogItem.trip_id == trip_id)
            )
            session.add(
                models.BacklogItem(
                    trip_id=trip_id,
                    place_id=stop.place_id,
                    reason=f"Moved here from Day {n}.",
                    position=(first or 0) - 1,
                )
            )

        case schemas.ReplaceDayStops(day_number=n, stops=wanted):
            day = _day(session, trip_id, n)
            _set_day_stops(day, wanted, {s.id: s for s in day.stops})
            # Places back on the day leave the backlog.
            for item in session.scalars(
                select(models.BacklogItem).where(
                    models.BacklogItem.trip_id == trip_id,
                    models.BacklogItem.place_id.in_([s.place_id for s in wanted]),
                )
            ):
                session.delete(item)

        case schemas.RestorePlan(days=wanted_days, backlog=wanted_backlog):
            days = {d.number: d for d in session.scalars(select(models.Day).where(models.Day.trip_id == trip_id))}
            # Every stop on the trip, so one that moved to another day moves back instead of being duplicated.
            pool = {s.id: s for d in days.values() for s in d.stops}
            for wanted in wanted_days:
                if wanted.day_number not in days:
                    raise EditRejected(f"Day {wanted.day_number} is not on trip {trip_id}")
                _set_day_stops(days[wanted.day_number], wanted.stops, pool)
            session.flush()
            for item in session.scalars(select(models.BacklogItem).where(models.BacklogItem.trip_id == trip_id)):
                session.delete(item)
            session.flush()
            for position, item in enumerate(wanted_backlog):
                session.add(
                    models.BacklogItem(trip_id=trip_id, place_id=item.place_id, reason=item.reason, position=position)
                )

        case schemas.AddFromBacklog(day_number=n, stop=new):
            day = _day(session, trip_id, n)
            item = session.scalar(
                select(models.BacklogItem).where(
                    models.BacklogItem.trip_id == trip_id, models.BacklogItem.place_id == new.place_id
                )
            )
            if item is None:
                raise EditRejected(f"{new.place_id} is not in the backlog")
            session.delete(item)
            day.stops.append(
                models.Stop(
                    id=new.id,
                    place_id=new.place_id,
                    position=len(day.stops),
                    title=new.title,
                    color=new.color,
                    objectives=new.objectives,
                    stay_minutes=new.stay.minutes,
                    stay_source=new.stay.source,
                    locked_at_min=new.locked_at_min,
                )
            )

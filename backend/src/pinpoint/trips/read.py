"""Builds the API's Trip from the database: one place that maps rows to the shape the frontend uses."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from pinpoint import models, schemas


class TripNotFound(Exception):
    pass


def _money(value: Decimal | None) -> float | None:
    return None if value is None else float(value)


def _place(p: models.Place) -> schemas.Place:
    cost = (
        schemas.Cost(usd=float(p.cost_usd), per=p.cost_per, source=p.cost_source)
        if p.cost_usd is not None and p.cost_per and p.cost_source
        else None
    )
    tip = schemas.Tip(text=p.tip_text, source=p.tip_source) if p.tip_text and p.tip_source else None
    return schemas.Place(
        id=p.id,
        name=p.name,
        area=p.area,
        city=p.city,
        location=schemas.LatLng(lat=p.lat, lng=p.lng),
        hours=p.hours,
        last_entry_min=p.last_entry_min,
        cost=cost,
        needs_booking=p.needs_booking,
        tip=tip,
        objectives=p.objectives,
    )


def stop_schema(s: models.Stop) -> schemas.Stop:
    return schemas.Stop(
        id=s.id,
        place_id=s.place_id,
        title=s.title,
        color=s.color,
        objectives=s.objectives,
        stay=schemas.StayTime(minutes=s.stay_minutes, source=s.stay_source),
        locked_at_min=s.locked_at_min,
        comments=[schemas.Comment(id=c.id, body=c.body, created_at=c.created_at.isoformat()) for c in s.comments],
    )


def load_trip(session: Session, trip_id: str) -> schemas.Trip:
    trip = session.scalar(
        select(models.Trip)
        .where(models.Trip.id == trip_id)
        .options(
            selectinload(models.Trip.days).selectinload(models.Day.stops).selectinload(models.Stop.comments),
            selectinload(models.Trip.stays),
            selectinload(models.Trip.flights),
            selectinload(models.Trip.backlog),
            selectinload(models.Trip.expenses),
        )
    )
    if trip is None:
        raise TripNotFound(trip_id)

    saved = session.scalars(
        select(models.SavedPlace).where(models.SavedPlace.user_id == trip.user_id).order_by(models.SavedPlace.id)
    ).all()
    posts = session.scalars(
        select(models.SavedPost).where(models.SavedPost.user_id == trip.user_id).order_by(models.SavedPost.id)
    ).all()

    # Every place the trip mentions: stops, backlog and saved places.
    place_ids = (
        {s.place_id for d in trip.days for s in d.stops}
        | {b.place_id for b in trip.backlog}
        | {sp.place_id for sp in saved}
    )
    places = session.scalars(select(models.Place).where(models.Place.id.in_(place_ids))).all()

    # Legs between any two nodes on this trip: its places and its stays.
    nodes = place_ids | {s.id for s in trip.stays}
    legs = session.scalars(
        select(models.Leg).where(models.Leg.from_node.in_(nodes), models.Leg.to_node.in_(nodes))
    ).all()

    return schemas.Trip(
        id=trip.id,
        name=trip.name,
        start_date=trip.start_date.isoformat(),
        end_date=trip.end_date.isoformat(),
        travelers=trip.travelers,
        budget_usd=float(trip.budget_usd),
        stays=[
            schemas.Stay(
                id=s.id,
                name=s.name,
                city=s.city,
                location=schemas.LatLng(lat=s.lat, lng=s.lng),
                check_in_date=s.check_in_date.isoformat(),
                check_out_date=s.check_out_date.isoformat(),
                check_in_min=s.check_in_min,
                check_out_min=s.check_out_min,
                cost_usd=_money(s.cost_usd),
            )
            for s in trip.stays
        ],
        flights=[
            schemas.Flight(
                id=f.id,
                airline=f.airline,
                number=f.number,
                from_=f.from_airport,
                to=f.to_airport,
                date=f.date.isoformat(),
                time_min=f.time_min,
                direction=f.direction,
                international=f.international,
                cost_usd=_money(f.cost_usd),
            )
            for f in trip.flights
        ],
        days=[
            schemas.Day(
                number=d.number,
                date=d.date.isoformat(),
                title=d.title,
                note=d.note,
                stay_id=d.stay_id,
                start_min=d.start_min,
                end_min=d.end_min,
                start_rows=d.start_rows,
                end_rows=d.end_rows,
                stops=[stop_schema(s) for s in d.stops],
            )
            for d in trip.days
        ],
        legs={
            f"{leg.from_node}>{leg.to_node}": schemas.Leg(
                mode=leg.mode,
                minutes=leg.minutes,
                distance_m=leg.distance_m,
                line=leg.line,
                fare_usd=_money(leg.fare_usd),
                source=leg.source,
            )
            for leg in legs
        },
        backlog=[schemas.BacklogItem(place_id=b.place_id, reason=b.reason) for b in trip.backlog],
        expenses=[
            schemas.Expense(
                id=e.id, amount_usd=float(e.amount_usd), category=e.category, note=e.note, date=e.date.isoformat()
            )
            for e in trip.expenses
        ],
        places={p.id: _place(p) for p in places},
        saved_places=[
            schemas.SavedPlace(
                place_id=sp.place_id, from_=sp.source, reel_count=sp.reel_count, included=sp.status == "in_trip"
            )
            for sp in saved
        ],
        saved_posts=[schemas.SavedPost(id=p.id, url=p.url, status=p.status) for p in posts],
    )

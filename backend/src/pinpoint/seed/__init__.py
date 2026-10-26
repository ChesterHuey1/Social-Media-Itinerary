"""Loads the sample Tokyo and Kyoto trip into the database. Safe to run again: it replaces the sample.

The data in demo_trip.json is in the API's own shape, so it is validated by the same schema the API returns.
"""

import json
from datetime import date
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.orm import Session

from pinpoint import models, schemas
from pinpoint.setup.days import DEFAULT_END_MIN, DEFAULT_START_MIN

DEMO_USER_ID = "me"
DEMO_FILE = Path(__file__).with_name("demo_trip.json")


def load_demo_json() -> schemas.Trip:
    return schemas.Trip.model_validate(json.loads(DEMO_FILE.read_text(encoding="utf-8")))


def seed_demo(session: Session) -> None:
    trip = load_demo_json()

    session.execute(delete(models.Trip).where(models.Trip.id == trip.id))
    session.execute(delete(models.SavedPlace).where(models.SavedPlace.user_id == DEMO_USER_ID))
    session.execute(delete(models.SavedPost).where(models.SavedPost.user_id == DEMO_USER_ID))
    nodes = set(trip.places) | {s.id for s in trip.stays}
    session.execute(delete(models.Leg).where(models.Leg.from_node.in_(nodes), models.Leg.to_node.in_(nodes)))
    session.flush()

    session.merge(models.User(id=DEMO_USER_ID, email=None, instagram_id=None))
    for p in trip.places.values():
        session.merge(
            models.Place(
                id=p.id,
                name=p.name,
                area=p.area,
                city=p.city,
                lat=p.location.lat,
                lng=p.location.lng,
                hours=p.hours.model_dump(by_alias=True),
                last_entry_min=p.last_entry_min,
                cost_usd=p.cost.usd if p.cost else None,
                cost_per=p.cost.per if p.cost else None,
                cost_source=p.cost.source if p.cost else None,
                needs_booking=p.needs_booking,
                tip_text=p.tip.text if p.tip else None,
                tip_source=p.tip.source if p.tip else None,
                objectives=list(p.objectives),
            )
        )

    session.add(
        models.Trip(
            id=trip.id,
            user_id=DEMO_USER_ID,
            name=trip.name,
            start_date=date.fromisoformat(trip.start_date),
            end_date=date.fromisoformat(trip.end_date),
            travelers=trip.travelers,
            budget_usd=trip.budget_usd,
            stays=[
                models.Stay(
                    id=s.id,
                    name=s.name,
                    city=s.city,
                    lat=s.location.lat,
                    lng=s.location.lng,
                    check_in_date=date.fromisoformat(s.check_in_date),
                    check_out_date=date.fromisoformat(s.check_out_date),
                    check_in_min=s.check_in_min,
                    check_out_min=s.check_out_min,
                    cost_usd=s.cost_usd,
                )
                for s in trip.stays
            ],
            flights=[
                models.Flight(
                    id=f.id,
                    airline=f.airline,
                    number=f.number,
                    from_airport=f.from_,
                    to_airport=f.to,
                    date=date.fromisoformat(f.date),
                    time_min=f.time_min,
                    direction=f.direction,
                    international=f.international,
                    cost_usd=f.cost_usd,
                    buffer_min=f.buffer_min,
                    transfer_min=f.transfer_min,
                )
                for f in trip.flights
            ],
            backlog=[
                models.BacklogItem(place_id=b.place_id, reason=b.reason, position=i) for i, b in enumerate(trip.backlog)
            ],
            expenses=[
                models.Expense(
                    id=e.id,
                    amount_usd=e.amount_usd,
                    category=e.category,
                    note=e.note,
                    date=date.fromisoformat(e.date),
                    original_amount=e.original_amount,
                    original_currency=e.original_currency,
                    fx_rate=e.fx_rate,
                    fx_date=None if e.fx_date is None else date.fromisoformat(e.fx_date),
                )
                for e in trip.expenses
            ],
        )
    )
    session.flush()

    arrivals = {f.date for f in trip.flights if f.direction == "arrive"}
    departures = {f.date for f in trip.flights if f.direction == "depart"}
    for d in trip.days:
        session.add(
            models.Day(
                trip_id=trip.id,
                number=d.number,
                date=date.fromisoformat(d.date),
                title=d.title,
                note=d.note,
                stay_id=d.stay_id,
                # The sample's hours are the ones chosen, except where a flight sets them.
                preferred_start_min=DEFAULT_START_MIN if d.date in arrivals else d.start_min,
                preferred_end_min=DEFAULT_END_MIN if d.date in departures else d.end_min,
                start_min=d.start_min,
                end_min=d.end_min,
                start_rows=[r.model_dump(by_alias=True) for r in d.start_rows],
                end_rows=[r.model_dump(by_alias=True) for r in d.end_rows],
                stops=[
                    models.Stop(
                        id=s.id,
                        place_id=s.place_id,
                        position=i,
                        title=s.title,
                        color=s.color,
                        objectives=list(s.objectives),
                        stay_minutes=s.stay.minutes,
                        stay_source=s.stay.source,
                        locked_at_min=s.locked_at_min,
                        comments=[
                            models.Comment(id=c.id, body=c.body, created_at=date.fromisoformat(c.created_at))
                            for c in s.comments
                        ],
                    )
                    for i, s in enumerate(d.stops)
                ],
            )
        )

    for key, leg in trip.legs.items():
        from_node, to_node = key.split(">")
        session.add(
            models.Leg(
                from_node=from_node,
                to_node=to_node,
                mode=leg.mode,
                minutes=leg.minutes,
                distance_m=leg.distance_m,
                line=leg.line,
                fare_usd=leg.fare_usd,
                source=leg.source,
            )
        )

    for sp in trip.saved_places:
        session.add(
            models.SavedPlace(
                user_id=DEMO_USER_ID,
                place_id=sp.place_id,
                source=sp.from_,
                reel_count=sp.reel_count,
                status="in_trip" if sp.included else "new",
            )
        )
    for post in trip.saved_posts:
        session.add(models.SavedPost(id=post.id, user_id=DEMO_USER_ID, url=post.url, caption=None, status=post.status))

"""Applies one Trip setup change, then works the days out again with days.py and stores the result."""

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from pinpoint import models, schemas
from pinpoint.setup.days import FlightIn, StayIn, plan_days

MAX_TRIP_DAYS = 60
DAY_REMOVED = "Its day is no longer on the trip."


class SetupRejected(Exception):
    """The change would leave the trip in a state that can't be planned. The message says why, for people."""


def _stays_in(trip: models.Trip) -> list[StayIn]:
    return [
        StayIn(s.id, s.name, s.check_in_date, s.check_out_date, s.check_in_min, s.check_out_min) for s in trip.stays
    ]


def _flights_in(trip: models.Trip) -> list[FlightIn]:
    return [
        FlightIn(
            f.direction, f.from_airport, f.to_airport, f.date, f.time_min, f.international, f.buffer_min, f.transfer_min
        )
        for f in trip.flights
    ]


def _check(trip: models.Trip) -> None:
    for s in trip.stays:
        if s.check_out_date <= s.check_in_date:
            raise SetupRejected(f"{s.name}: check-out has to be after check-in.")
    ordered = sorted(trip.stays, key=lambda s: s.check_in_date)
    for a, b in zip(ordered, ordered[1:], strict=False):
        if b.check_in_date < a.check_out_date:
            raise SetupRejected(f"{a.name} and {b.name} overlap. Change one hotel's dates first.")
    for direction in ("arrive", "depart"):
        dates = [f.date for f in trip.flights if f.direction == direction]
        if len(dates) != len(set(dates)):
            word = "arriving" if direction == "arrive" else "leaving"
            raise SetupRejected(f"There's already a flight {word} that day.")


def sync_days(session: Session, trip: models.Trip) -> None:
    """Makes the stored days match days.py: adds and removes days as the dates change (stops on a removed day go
    to the backlog), and rewrites each day's hotel, hours, fixed rows and note. Titles and stops are kept."""
    _check(trip)
    chosen = {d.date: (d.preferred_start_min, d.preferred_end_min) for d in trip.days}
    plans = plan_days(_stays_in(trip), _flights_in(trip), chosen)
    if not plans:
        raise SetupRejected("A trip needs at least one hotel.")
    if len(plans) > MAX_TRIP_DAYS:
        raise SetupRejected(f"Trips can be up to {MAX_TRIP_DAYS} days. Check the flight and hotel dates.")

    by_date = {d.date: d for d in trip.days}
    wanted = {p.date for p in plans}
    for day in [d for d in trip.days if d.date not in wanted]:
        listed = {b.place_id for b in trip.backlog}
        for stop in day.stops:
            if stop.place_id not in listed:
                trip.backlog.append(
                    models.BacklogItem(place_id=stop.place_id, reason=DAY_REMOVED, position=len(trip.backlog))
                )
                listed.add(stop.place_id)
        trip.days.remove(day)
    # Day numbers are unique per trip, so move the kept days out of the way before numbering them again.
    for day in trip.days:
        day.number = -day.number
    session.flush()

    cities = {s.id: s.city for s in trip.stays}
    days = []
    for number, plan in enumerate(plans, start=1):
        day = by_date.get(plan.date) or models.Day(
            trip_id=trip.id, date=plan.date, title=f"Day in {cities[plan.stay_id]}", stops=[]
        )
        day.number = number
        day.stay_id = plan.stay_id
        day.start_min, day.end_min, day.note = plan.start_min, plan.end_min, plan.note
        day.start_rows = [{"kind": r.kind, "text": r.text, "atMin": r.at_min} for r in plan.start_rows]
        day.end_rows = [{"kind": r.kind, "text": r.text, "atMin": r.at_min} for r in plan.end_rows]
        days.append(day)
    trip.days = days
    trip.start_date, trip.end_date = plans[0].date, plans[-1].date


def _day(trip: models.Trip, number: int) -> models.Day:
    day = next((d for d in trip.days if d.number == number), None)
    if day is None:
        raise SetupRejected(f"Day {number} isn't on this trip.")
    return day


def _money(value: float | None) -> Decimal | None:
    return None if value is None else Decimal(str(value))


def apply_setup(session: Session, trip: models.Trip, change: schemas.SetupChange) -> None:
    match change:
        case schemas.SetTripDetails(name=name, travelers=travelers, budget_usd=budget):
            trip.name, trip.travelers, trip.budget_usd = name.strip(), travelers, Decimal(str(budget))
            return  # Nothing here changes the days.
        case schemas.SetDayHours(day_number=n, start_min=start, end_min=end):
            if end <= start:
                raise SetupRejected("The day has to end after it starts.")
            day = _day(trip, n)
            day.preferred_start_min, day.preferred_end_min = start, end
        case schemas.SaveFlight(flight=f):
            flight = next((x for x in trip.flights if x.id == f.id), None)
            if flight is None:
                flight = models.Flight(id=f.id)
                trip.flights.append(flight)
            flight.airline, flight.number = f.airline.strip(), f.number.strip()
            flight.from_airport, flight.to_airport = f.from_.upper(), f.to.upper()
            flight.date, flight.time_min, flight.direction = date.fromisoformat(f.date), f.time_min, f.direction
            flight.international, flight.cost_usd = f.international, _money(f.cost_usd)
            flight.buffer_min, flight.transfer_min = f.buffer_min, f.transfer_min
        case schemas.RemoveFlight(flight_id=flight_id):
            flight = next((x for x in trip.flights if x.id == flight_id), None)
            if flight is None:
                raise SetupRejected("That flight isn't on this trip.")
            trip.flights.remove(flight)
        case schemas.SaveStay(stay=s):
            stay = next((x for x in trip.stays if x.id == s.id), None)
            if stay is None:
                raise SetupRejected("Adding a hotel needs hotel search, which isn't set up yet.")
            stay.check_in_date, stay.check_out_date = (
                date.fromisoformat(s.check_in_date),
                date.fromisoformat(s.check_out_date),
            )
            stay.check_in_min, stay.check_out_min, stay.cost_usd = s.check_in_min, s.check_out_min, _money(s.cost_usd)
    session.flush()
    sync_days(session, trip)

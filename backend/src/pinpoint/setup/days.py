"""Works out every day of a trip from its flights, hotels and the hours you chose.

- The trip runs from the arrival flight to the departure flight. Without one, the first check-in or last check-out.
- Each night belongs to the hotel whose stay covers it. The last day belongs to the hotel you check out of.
- Arrival day starts at landing + the airport buffer (90 min international, 60 domestic) + time to the hotel.
- Departure day ends at take-off - time at the airport (3 h international, 2 h domestic) - time to the airport.
- Every other start and end is the time you chose, 8:30 AM to 9:30 PM unless you changed it.
- The fixed rows shown above the first stop and below the last (landing, check-in, leaving the hotel) follow.

Pure, so it is tested without a database. service.py applies the result to the stored days.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta

DEFAULT_START_MIN = 8 * 60 + 30
DEFAULT_END_MIN = 21 * 60 + 30
# Spec: 1 h 30 m after an international landing for immigration and bags, 1 h after a domestic one.
ARRIVAL_BUFFER_MIN = {True: 90, False: 60}
# Spec: at the airport 3 h before an international flight, 2 h before a domestic one.
DEPARTURE_BUFFER_MIN = {True: 180, False: 120}
# Until airport transfers are looked up (docs/decisions.md, Airport transfers), unless you set it per flight.
DEFAULT_TRANSFER_MIN = 60


@dataclass(frozen=True)
class StayIn:
    id: str
    name: str
    check_in_date: date
    check_out_date: date
    check_in_min: int
    check_out_min: int


@dataclass(frozen=True)
class FlightIn:
    direction: str  # "arrive" or "depart"
    from_airport: str
    to_airport: str
    date: date
    time_min: int
    international: bool
    buffer_min: int | None = None
    transfer_min: int | None = None


@dataclass(frozen=True)
class Row:
    kind: str  # "hotel" or "flight"
    text: str
    at_min: int


@dataclass(frozen=True)
class DayOut:
    date: date
    stay_id: str
    start_min: int
    end_min: int
    note: str | None
    start_rows: list[Row] = field(default_factory=list)
    end_rows: list[Row] = field(default_factory=list)


def clock(minutes: int) -> str:
    """ "11:40 AM", like the frontend's formatClock."""
    m = minutes % 1440
    h24, mm = divmod(m, 60)
    h12 = 12 if h24 % 12 == 0 else h24 % 12
    return f"{h12}:{mm:02d} {'AM' if h24 < 12 else 'PM'}"


def span(minutes: int) -> str:
    """ "90 min", "3 h"."""
    return f"{minutes // 60} h" if minutes >= 120 and minutes % 60 == 0 else f"{minutes} min"


def trip_dates(stays: list[StayIn], flights: list[FlightIn]) -> tuple[date, date] | None:
    """From the arrival flight to the departure flight. Without one, the first check-in or the last check-out."""
    arrivals = [f.date for f in flights if f.direction == "arrive"]
    departures = [f.date for f in flights if f.direction == "depart"]
    if not stays and not (arrivals and departures):
        return None
    first = min(arrivals) if arrivals else min(s.check_in_date for s in stays)
    last = max(departures) if departures else max(s.check_out_date for s in stays)
    return first, max(last, first)


def _stay_for(day: date, stays: list[StayIn]) -> StayIn:
    """The hotel you sleep at that night; the last day goes to the hotel you check out of; a night with no hotel goes
    to the one before it."""
    ordered = sorted(stays, key=lambda s: s.check_in_date)
    for s in ordered:
        if s.check_in_date <= day < s.check_out_date:
            return s
    before = [s for s in ordered if s.check_in_date <= day]
    return before[-1] if before else ordered[0]


def plan_days(
    stays: list[StayIn], flights: list[FlightIn], chosen: dict[date, tuple[int, int]] | None = None
) -> list[DayOut]:
    """`chosen` maps a date to the (start, end) you set for it."""
    dates = trip_dates(stays, flights)
    if dates is None or not stays:
        return []
    chosen = chosen or {}
    first, last = dates
    days = []
    for offset in range((last - first).days + 1):
        on = first + timedelta(days=offset)
        stay = _stay_for(on, stays)
        before = _stay_for(on - timedelta(days=1), stays) if on > first else None
        start, end = chosen.get(on, (DEFAULT_START_MIN, DEFAULT_END_MIN))
        notes = []
        landing = next((f for f in flights if f.direction == "arrive" and f.date == on), None)
        leaving = next((f for f in flights if f.direction == "depart" and f.date == on), None)

        if landing:
            buffer = landing.buffer_min if landing.buffer_min is not None else ARRIVAL_BUFFER_MIN[landing.international]
            transfer = landing.transfer_min if landing.transfer_min is not None else DEFAULT_TRANSFER_MIN
            start = landing.time_min + buffer + transfer
            arrive = "Drop bags at" if start < stay.check_in_min else "Check in:"
            start_rows = [
                Row("flight", f"Land at {landing.to_airport}", landing.time_min),
                Row("hotel", f"{arrive} {stay.name}", start),
            ]
            notes.append(
                f"Land {clock(landing.time_min)}, {span(buffer)} for immigration and bags, "
                f"{span(transfer)} to the hotel."
            )
        elif before is not None and before.id != stay.id:
            start_rows = [Row("hotel", f"Check out: {before.name}", start)]
            notes.append(f"Out by {clock(before.check_out_min)}, in from {clock(stay.check_in_min)}.")
        elif before is None:
            start_rows = [Row("hotel", f"Drop bags at {stay.name}", start)]
        elif on == stay.check_out_date:
            start_rows = [Row("hotel", f"Check out: {stay.name}", start)]
        else:
            start_rows = [Row("hotel", f"Leave {stay.name}", start)]

        if leaving:
            buffer = (
                leaving.buffer_min if leaving.buffer_min is not None else DEPARTURE_BUFFER_MIN[leaving.international]
            )
            transfer = leaving.transfer_min if leaving.transfer_min is not None else DEFAULT_TRANSFER_MIN
            end = leaving.time_min - buffer - transfer
            end_rows = [Row("flight", f"Leave for {leaving.from_airport}", end)]
            notes.append(
                f"Departs {clock(leaving.time_min)}, {span(buffer)} at the airport, "
                f"{span(transfer)} to {leaving.from_airport}."
            )
        elif before is None or before.id != stay.id:
            end_rows = [Row("hotel", f"Check in: {stay.name}", end)]
        else:
            end_rows = [Row("hotel", f"Back at {stay.name}", end)]

        # A flight can leave no time at all; the day then has none rather than a negative amount.
        end = max(end, start)
        end_rows = [Row(r.kind, r.text, end) if r.at_min > end else r for r in end_rows]
        days.append(DayOut(on, stay.id, start, end, " ".join(notes) or None, start_rows, end_rows))
    return days

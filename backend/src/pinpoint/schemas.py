"""API shapes. They mirror frontend/src/domain/types.ts field for field (camelCase on the wire),
so the frontend uses responses as-is. Change both files together."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Objective = Literal["eat", "explore", "pictures", "experience"]
StopColor = Literal["green", "blue", "amber", "ink"]
FactSource = Literal["google", "scrape", "deepseek"]


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class LatLng(Schema):
    lat: float
    lng: float


class OpenWindow(Schema):
    open_min: int
    close_min: int


class WindowHours(Schema):
    kind: Literal["windows"]
    windows: list[OpenWindow]
    source: Literal["google", "scrape"]


class AlwaysOpen(Schema):
    kind: Literal["always"]


class UnconfirmedHours(Schema):
    kind: Literal["unconfirmed"]


Hours = Annotated[WindowHours | AlwaysOpen | UnconfirmedHours, Field(discriminator="kind")]


class Cost(Schema):
    usd: float
    per: Literal["person", "ticket"]
    source: FactSource


class Tip(Schema):
    text: str
    source: FactSource


class Place(Schema):
    id: str
    name: str
    area: str
    city: str
    location: LatLng
    hours: Hours
    last_entry_min: int
    cost: Cost | None
    needs_booking: bool
    tip: Tip | None
    objectives: list[Objective]


class Comment(Schema):
    id: str
    body: str
    created_at: str


class StayTime(Schema):
    minutes: int = Field(gt=0)
    source: Literal["estimate", "user"]


class Stop(Schema):
    id: str
    place_id: str
    title: str | None
    color: StopColor
    objectives: list[Objective]
    stay: StayTime
    locked_at_min: int | None
    comments: list[Comment]


class Leg(Schema):
    mode: Literal["walk", "transit"]
    minutes: int
    distance_m: int
    line: str | None
    fare_usd: float | None
    source: Literal["routes", "estimate"]


class FixedRow(Schema):
    kind: Literal["hotel", "flight"]
    text: str
    at_min: int


class Day(Schema):
    number: int
    date: str
    title: str
    note: str | None
    stay_id: str
    start_min: int
    end_min: int
    start_rows: list[FixedRow]
    end_rows: list[FixedRow]
    stops: list[Stop]


class Stay(Schema):
    id: str
    name: str
    city: str
    location: LatLng
    check_in_date: str
    check_out_date: str
    check_in_min: int
    check_out_min: int
    cost_usd: float | None


class Flight(Schema):
    id: str
    airline: str
    number: str
    # `from` is a Python keyword, so the field is named from_ and sent as "from".
    from_: str = Field(alias="from")
    to: str
    date: str
    time_min: int
    direction: Literal["arrive", "depart"]
    international: bool
    cost_usd: float | None
    # Null uses the default: 90 or 60 minutes after landing, 3 or 2 hours before take-off.
    buffer_min: int | None = None
    # Minutes between the airport and the hotel. Null uses 60.
    transfer_min: int | None = None


class BacklogItem(Schema):
    place_id: str
    reason: str


ExpenseCategory = Literal["food", "tickets", "transit"]


class Expense(Schema):
    id: str
    amount_usd: float
    category: ExpenseCategory
    note: str
    date: str
    # Set when the expense was entered in another currency.
    original_amount: float | None = None
    original_currency: str | None = None
    fx_rate: float | None = None
    fx_date: str | None = None


class NewExpense(Schema):
    amount: float = Field(gt=0)
    currency: str
    category: ExpenseCategory
    note: str = ""
    date: str


class FxQuote(Schema):
    currency: str
    usd_per_unit: float
    # The day the rate is from, which can be earlier than the day asked for.
    rate_date: str


class SavedPlace(Schema):
    place_id: str
    # "from" again: where the place was saved from.
    from_: Literal["reel", "search"] = Field(alias="from")
    reel_count: int
    # new: saved since the last build. in_trip: on a day or in the backlog. dismissed: left out at a build.
    status: Literal["new", "in_trip", "dismissed"]


class SavedPost(Schema):
    id: str
    url: str
    status: Literal["pending", "done", "needs_review"]


class Trip(Schema):
    id: str
    name: str
    start_date: str
    end_date: str
    travelers: int
    budget_usd: float
    stays: list[Stay]
    flights: list[Flight]
    days: list[Day]
    # Keyed "fromNode>toNode", as in the frontend.
    legs: dict[str, Leg]
    backlog: list[BacklogItem]
    expenses: list[Expense]
    places: dict[str, Place]
    saved_places: list[SavedPlace]
    saved_posts: list[SavedPost]


# ---------- Edits: the same union the frontend dispatches (frontend/src/domain/tripEdits.ts) ----------


class StopChanges(Schema):
    title: str | None = None
    color: StopColor | None = None
    objectives: list[Objective] | None = None
    stay: StayTime | None = None
    locked_at_min: int | None = None


class MoveStop(Schema):
    type: Literal["moveStop"]
    day_number: int
    from_index: int
    to_index: int


class UpdateStop(Schema):
    type: Literal["updateStop"]
    day_number: int
    stop_id: str
    changes: StopChanges


class AddComment(Schema):
    type: Literal["addComment"]
    day_number: int
    stop_id: str
    comment_id: str
    body: str
    created_at: str


class MoveToBacklog(Schema):
    type: Literal["moveToBacklog"]
    day_number: int
    stop_id: str


class MoveToDay(Schema):
    """Moves a stop to the end of another day. Its locked time is cleared: it was a time on the old day."""

    type: Literal["moveToDay"]
    day_number: int
    stop_id: str
    to_day_number: int


class SavedToDay(Schema):
    """Puts a new saved place at the end of a day."""

    type: Literal["savedToDay"]
    day_number: int
    stop: Stop


class SavedToBacklog(Schema):
    """Puts a new saved place in the backlog."""

    type: Literal["savedToBacklog"]
    place_id: str


class AddFromBacklog(Schema):
    type: Literal["addFromBacklog"]
    day_number: int
    stop: Stop


class ReplaceDayStops(Schema):
    """Puts a day back to exactly these stops. Undo after Optimize route sends the day's previous stops."""

    type: Literal["replaceDayStops"]
    day_number: int
    stops: list[Stop]


class DayStops(Schema):
    day_number: int
    stops: list[Stop]


class RestorePlan(Schema):
    """Puts every day and the backlog back exactly. Undo after Build itinerary sends the trip's plan from before."""

    type: Literal["restorePlan"]
    days: list[DayStops]
    backlog: list[BacklogItem]


TripEdit = Annotated[
    MoveStop
    | UpdateStop
    | AddComment
    | MoveToBacklog
    | MoveToDay
    | SavedToDay
    | SavedToBacklog
    | AddFromBacklog
    | ReplaceDayStops
    | RestorePlan,
    Field(discriminator="type"),
]


class DroppedStop(Schema):
    place_id: str
    reason: str


class BuildRequest(Schema):
    included_place_ids: list[str]
    # A plan from /build/preview to save exactly as shown. Without one, the build runs again.
    plan: "PlanSnapshot | None" = None


class PlanSnapshot(Schema):
    days: list[DayStops]
    backlog: list[BacklogItem]


class BuildResult(Schema):
    trip: Trip
    # The plan before building, for Undo.
    previous: PlanSnapshot
    placed: int
    backlogged: list["DroppedStop"]


class OptimizeResult(Schema):
    trip: Trip
    # The day before optimizing, for Undo.
    previous_stops: list[Stop]
    dropped: list[DroppedStop]


# Trip setup. Each change is saved on its own, then the server works the days out again (setup/days.py).

Minute = Annotated[int, Field(ge=0, lt=24 * 60)]


class SetTripDetails(Schema):
    type: Literal["setTripDetails"]
    name: str = Field(min_length=1, max_length=120)
    travelers: int = Field(ge=1, le=50)
    budget_usd: float = Field(ge=0)


class SetDayHours(Schema):
    type: Literal["setDayHours"]
    day_number: int
    start_min: Minute
    end_min: Minute


class SaveFlight(Schema):
    """Adds the flight, or replaces the one with the same id."""

    type: Literal["saveFlight"]
    flight: Flight


class RemoveFlight(Schema):
    type: Literal["removeFlight"]
    flight_id: str


class SaveStay(Schema):
    """Changes a hotel's dates, times or cost. Adding a hotel needs place search, which comes with the Google key."""

    type: Literal["saveStay"]
    stay: Stay


SetupChange = Annotated[
    SetTripDetails | SetDayHours | SaveFlight | RemoveFlight | SaveStay,
    Field(discriminator="type"),
]

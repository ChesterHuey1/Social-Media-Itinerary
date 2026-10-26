from datetime import date

from fastapi.testclient import TestClient

from pinpoint.seed import load_demo_json
from pinpoint.setup.days import FlightIn, StayIn, plan_days

KYOTO = StayIn("kyoto", "Kyoto Hotel", date(2026, 3, 1), date(2026, 3, 3), 900, 660)


def flight(direction: str, on: date, at: int, **fields: object) -> FlightIn:
    ends = ("SFO", "KIX") if direction == "arrive" else ("KIX", "SFO")
    return FlightIn(direction, *ends, on, at, fields.pop("international", True), **fields)


def day_dict(d: dict) -> dict:
    keep = ("date", "stayId", "startMin", "endMin", "note", "startRows", "endRows")
    return {k: d[k] for k in keep}


def test_the_sample_trip_is_what_its_flights_and_hotels_give() -> None:
    """The sample's hand-written days and the worked-out days agree, so the sample can't drift."""
    trip = load_demo_json()
    arrivals = {f.date for f in trip.flights if f.direction == "arrive"}
    departures = {f.date for f in trip.flights if f.direction == "depart"}
    chosen = {
        date.fromisoformat(d.date): (
            510 if d.date in arrivals else d.start_min,
            1290 if d.date in departures else d.end_min,
        )
        for d in trip.days
    }
    stays = [
        StayIn(
            s.id,
            s.name,
            date.fromisoformat(s.check_in_date),
            date.fromisoformat(s.check_out_date),
            s.check_in_min,
            s.check_out_min,
        )
        for s in trip.stays
    ]
    flights = [
        FlightIn(
            f.direction,
            f.from_,
            f.to,
            date.fromisoformat(f.date),
            f.time_min,
            f.international,
            f.buffer_min,
            f.transfer_min,
        )
        for f in trip.flights
    ]
    planned = plan_days(stays, flights, chosen)
    assert [p.date.isoformat() for p in planned] == [d.date for d in trip.days]
    for plan, day in zip(planned, trip.days, strict=True):
        assert (plan.stay_id, plan.start_min, plan.end_min, plan.note) == (
            day.stay_id,
            day.start_min,
            day.end_min,
            day.note,
        )
        assert [(r.kind, r.text, r.at_min) for r in plan.start_rows] == [
            (r.kind, r.text, r.at_min) for r in day.start_rows
        ]
        assert [(r.kind, r.text, r.at_min) for r in plan.end_rows] == [(r.kind, r.text, r.at_min) for r in day.end_rows]


def test_arrival_day_starts_after_buffer_and_transfer() -> None:
    days = plan_days([KYOTO], [flight("arrive", date(2026, 3, 1), 9 * 60)])
    # 9:00 + 90 min international + 60 min to the hotel.
    assert days[0].start_min == 11 * 60 + 30
    assert days[0].note == "Land 9:00 AM, 90 min for immigration and bags, 60 min to the hotel."
    domestic = plan_days([KYOTO], [flight("arrive", date(2026, 3, 1), 9 * 60, international=False, transfer_min=20)])
    assert domestic[0].start_min == 9 * 60 + 60 + 20


def test_departure_day_ends_before_airport_time_and_transfer() -> None:
    days = plan_days([KYOTO], [flight("depart", date(2026, 3, 3), 18 * 60, buffer_min=150)])
    assert days[-1].end_min == 18 * 60 - 150 - 60
    assert days[-1].end_rows[0].text == "Leave for KIX"


def test_an_early_flight_leaves_no_time_rather_than_negative_time() -> None:
    days = plan_days([KYOTO], [flight("depart", date(2026, 3, 3), 7 * 60)])
    assert days[-1].end_min == days[-1].start_min


def test_flights_set_the_trip_dates() -> None:
    days = plan_days(
        [KYOTO], [flight("arrive", date(2026, 2, 28), 22 * 60), flight("depart", date(2026, 3, 2), 20 * 60)]
    )
    assert [d.date for d in days] == [date(2026, 2, 28), date(2026, 3, 1), date(2026, 3, 2)]


def test_chosen_hours_apply_to_days_without_flights() -> None:
    days = plan_days([KYOTO], [], {date(2026, 3, 2): (7 * 60, 23 * 60)})
    assert (days[1].start_min, days[1].end_min) == (7 * 60, 23 * 60)
    assert days[1].start_rows[0].text == "Leave Kyoto Hotel"


# Through the API.


def setup(client: TestClient, change: dict) -> dict:
    response = client.post("/api/trips/demo/setup", json=change)
    assert response.status_code == 200, response.text
    return response.json()


def test_trip_details_are_saved(client: TestClient) -> None:
    setup(client, {"type": "setTripDetails", "name": "Japan in the fall", "travelers": 2, "budgetUsd": 4200})
    trip = client.get("/api/trips/demo").json()
    assert (trip["name"], trip["travelers"], trip["budgetUsd"]) == ("Japan in the fall", 2, 4200)


def test_a_saving_that_changes_nothing_leaves_the_days_as_seeded(client: TestClient) -> None:
    before = client.get("/api/trips/demo").json()
    trip = setup(client, {"type": "setDayHours", "dayNumber": 2, "startMin": 510, "endMin": 1290})
    assert [day_dict(d) for d in trip["days"]] == [day_dict(d) for d in before["days"]]


def test_day_hours_move_the_hotel_rows(client: TestClient) -> None:
    trip = setup(client, {"type": "setDayHours", "dayNumber": 2, "startMin": 420, "endMin": 1380})
    day = trip["days"][1]
    assert (day["startMin"], day["endMin"]) == (420, 1380)
    assert day["startRows"][0]["atMin"] == 420
    assert day["endRows"][0]["atMin"] == 1380


def test_changing_the_landing_time_moves_day_one(client: TestClient) -> None:
    out = next(f for f in client.get("/api/trips/demo").json()["flights"] if f["id"] == "out")
    trip = setup(client, {"type": "saveFlight", "flight": {**out, "timeMin": 540}})
    assert trip["days"][0]["startMin"] == 540 + 90 + 40
    assert trip["days"][0]["startRows"][0] == {"kind": "flight", "text": "Land at HND", "atMin": 540}


def test_removing_the_arrival_flight_gives_day_one_its_chosen_start(client: TestClient) -> None:
    trip = setup(client, {"type": "removeFlight", "flightId": "out"})
    assert trip["days"][0]["startMin"] == 510
    assert [f["id"] for f in trip["flights"]] == ["home"]


def test_an_earlier_flight_home_removes_days_and_backlogs_their_stops(client: TestClient) -> None:
    home = next(f for f in client.get("/api/trips/demo").json()["flights"] if f["id"] == "home")
    trip = setup(client, {"type": "saveFlight", "flight": {**home, "date": "2026-11-15"}})
    assert [d["date"] for d in trip["days"]] == ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]
    assert trip["endDate"] == "2026-11-15"
    backlogged = {b["placeId"]: b["reason"] for b in trip["backlog"]}
    for place in ("fushimi", "nishiki", "kinkakuji"):
        assert backlogged[place] == "Its day is no longer on the trip."


def test_a_later_flight_home_adds_a_day(client: TestClient) -> None:
    home = next(f for f in client.get("/api/trips/demo").json()["flights"] if f["id"] == "home")
    trip = setup(client, {"type": "saveFlight", "flight": {**home, "date": "2026-11-18"}})
    assert trip["days"][-1]["number"] == 7
    assert trip["days"][-1]["title"] == "Day in Kyoto"
    assert trip["days"][-1]["stops"] == []


def test_hotel_dates_decide_which_hotel_a_day_uses(client: TestClient) -> None:
    trip = client.get("/api/trips/demo").json()
    ginza, kanra = trip["stays"]
    setup(client, {"type": "saveStay", "stay": {**ginza, "checkOutDate": "2026-11-14"}})
    trip = setup(client, {"type": "saveStay", "stay": {**kanra, "checkInDate": "2026-11-14"}})
    assert [d["stayId"] for d in trip["days"]] == ["ginza", "ginza", "kanra", "kanra", "kanra", "kanra"]
    assert trip["days"][2]["startRows"][0]["text"] == "Check out: Mitsui Garden Hotel Ginza Premier"


def test_changes_that_cant_be_planned_are_refused_and_nothing_is_saved(client: TestClient) -> None:
    before = client.get("/api/trips/demo").json()
    ginza = before["stays"][0]
    for change in (
        {"type": "saveStay", "stay": {**ginza, "checkOutDate": "2026-11-16"}},
        {"type": "saveStay", "stay": {**ginza, "checkOutDate": "2026-11-12"}},
        {"type": "setDayHours", "dayNumber": 2, "startMin": 900, "endMin": 600},
        {"type": "setDayHours", "dayNumber": 9, "startMin": 500, "endMin": 600},
        {"type": "removeFlight", "flightId": "nope"},
    ):
        response = client.post("/api/trips/demo/setup", json=change)
        assert response.status_code == 409, change
    assert client.get("/api/trips/demo").json() == before

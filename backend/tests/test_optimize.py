from typing import Any

from fastapi.testclient import TestClient

from pinpoint.plan.optimize import MEALS, StopInput, Window, assign_meals, optimize_day
from pinpoint.plan.travel import Node, estimate

DAY_START, DAY_END = 8 * 60, 21 * 60


def line_travel(positions: list[int]):
    """Nodes on a straight road: minutes between two nodes = 10 per kilometer marker apart."""

    def travel(i: int, j: int) -> int:
        return 10 * abs(positions[i] - positions[j])

    return travel


def stop(sid: str, stay: int = 60, windows: list[Window] | None = None, locked: int | None = None) -> StopInput:
    return StopInput(sid, stay, windows, last_entry_min=0, locked_at_min=locked)


# ---------- The solver on its own ----------


def test_orders_stops_along_the_road_instead_of_backtracking() -> None:
    # Hotel at 0; stops at 3, 1, 2 in the order given.
    plan = optimize_day([stop("far"), stop("near"), stop("mid")], line_travel([0, 3, 1, 2]), DAY_START, DAY_END)
    assert plan.order in (["near", "mid", "far"], ["far", "mid", "near"])
    assert plan.dropped == []


def test_fills_the_morning_before_a_place_that_opens_at_noon() -> None:
    noon = [Window(12 * 60, DAY_END)]
    plan = optimize_day(
        [stop("opens_noon", windows=noon), stop("a", stay=120), stop("b", stay=120)],
        line_travel([0, 1, 2, 3]),
        DAY_START,
        DAY_END,
    )
    assert plan.order[-1] == "opens_noon"


def test_a_short_morning_never_drops_a_late_opening_stop() -> None:
    # Waiting is capped at 20 minutes, but leaving the hotel later is not, so all three still fit.
    noon = [Window(12 * 60, DAY_END)]
    stops = [stop("opens_noon", windows=noon), stop("a", stay=30), stop("b", stay=30)]
    plan = optimize_day(stops, line_travel([0, 1, 2, 3]), DAY_START, DAY_END)
    assert plan.dropped == []
    assert sorted(plan.order) == ["a", "b", "opens_noon"]


def test_keeps_a_locked_stop_at_its_time() -> None:
    plan = optimize_day(
        [stop("a", stay=60), stop("ticket", stay=60, locked=9 * 60), stop("b", stay=60)],
        line_travel([0, 1, 1, 1]),
        DAY_START,
        DAY_END,
    )
    assert plan.order[0] == "ticket"


def test_drops_a_stop_closed_all_day_instead_of_failing() -> None:
    plan = optimize_day([stop("a"), stop("closed", windows=[])], line_travel([0, 1, 1]), DAY_START, DAY_END)
    assert plan.order == ["a"]
    assert plan.dropped == ["closed"]


def test_never_plans_a_visit_across_the_lunch_break() -> None:
    lunch_and_dinner = [Window(11 * 60 + 30, 14 * 60 + 30), Window(17 * 60 + 30, 22 * 60)]
    # A 3-hour stop first thing, then the restaurant: arriving 11:30 + 180 + travel puts it in the break.
    plan = optimize_day(
        [
            stop("restaurant", stay=60, windows=lunch_and_dinner),
            stop("museum", stay=5 * 60, windows=[Window(9 * 60, 17 * 60)]),
        ],
        line_travel([0, 1, 1]),
        DAY_START,
        DAY_END,
    )
    assert plan.dropped == []
    # Either the restaurant at lunch before the museum, or at dinner after it; never in the 14:30-17:30 gap.
    assert plan.order in (["restaurant", "museum"], ["museum", "restaurant"])


def test_dinner_goes_to_the_place_open_latest_and_lunch_to_the_next() -> None:
    noon_to_late = [Window(11 * 60, 23 * 60)]
    market = [Window(5 * 60, 14 * 60)]
    meals = assign_meals(
        [stop("market", windows=market), stop("ramen"), stop("sushi", windows=noon_to_late)], 8 * 60, 21 * 60
    )
    _, lunch, dinner = MEALS
    assert meals["ramen"] == (dinner[1], dinner[2])  # open all day, so it stays open latest
    assert meals["sushi"] == (lunch[1], lunch[2])
    assert meals["market"] == (8 * 60, 10 * 60)  # breakfast, starting when the day does


def test_eat_stops_land_near_lunch_and_dinner() -> None:
    _, lunch, dinner = MEALS
    stops = [
        stop("museum", stay=180),
        stop("lunch", stay=60),
        stop("walk", stay=180),
        stop("park", stay=120),
        stop("dinner", stay=60),
    ]
    meals = {"lunch": (lunch[1], lunch[2]), "dinner": (dinner[1], dinner[2])}
    stops = [StopInput(s.id, s.stay_min, s.windows, 0, None, meals.get(s.id)) for s in stops]
    plan = optimize_day(stops, line_travel([0, 1, 1, 1, 1, 1]), DAY_START, DAY_END)
    assert plan.dropped == []
    assert lunch[1] <= plan.arrivals["lunch"] <= lunch[2]
    assert dinner[1] <= plan.arrivals["dinner"] <= dinner[2]


def test_estimate_matches_the_frontend() -> None:
    # Same cases as frontend/src/domain/timeline.test.ts "estimates legs with the same numbers as the backend".
    walk = estimate(Node("a", 35.6654, 139.7707), Node("b", 35.6672, 139.764))
    transit = estimate(Node("a", 35.6614, 139.7016), Node("b", 35.6491, 139.7898))
    assert (walk.mode, walk.minutes, walk.distance_m) == ("walk", 12, 850)
    assert (transit.mode, transit.minutes, transit.distance_m) == ("transit", 35, 10500)


# ---------- Through the API, on the sample trip ----------


def optimize(client: TestClient, day: int = 2) -> dict[str, Any]:
    response = client.post(f"/api/trips/demo/days/{day}/optimize")
    assert response.status_code == 200, response.text
    return response.json()


def day_stops(trip: dict[str, Any], number: int = 2) -> list[dict[str, Any]]:
    return next(d for d in trip["days"] if d["number"] == number)["stops"]


def test_day_two_moves_the_evening_bar_after_dinner_and_keeps_every_stop(client: TestClient) -> None:
    result = optimize(client)
    names = [s["placeId"] for s in day_stops(result["trip"])]
    assert result["dropped"] == []
    assert names[:2] == ["tsukiji", "teamlab"]  # teamLab is locked at 11:00; only Tsukiji fits before it.
    assert names.index("nonbei") > names.index("uobei")  # Nonbei Yokocho opens at 5 PM.
    assert [s["placeId"] for s in result["previousStops"]] == [
        "tsukiji",
        "teamlab",
        "ichiran",
        "shibuyaSky",
        "nonbei",
        "uobei",
    ]


def test_optimize_saves_the_new_order(client: TestClient) -> None:
    result = optimize(client)
    saved = client.get("/api/trips/demo").json()
    assert [s["id"] for s in day_stops(saved)] == [s["id"] for s in day_stops(result["trip"])]


def test_undo_puts_the_day_back_exactly(client: TestClient) -> None:
    before = day_stops(client.get("/api/trips/demo").json())
    result = optimize(client)
    response = client.post(
        "/api/trips/demo/edits", json={"type": "replaceDayStops", "dayNumber": 2, "stops": result["previousStops"]}
    )
    assert response.status_code == 200
    assert day_stops(response.json()) == before


def test_a_stop_that_cannot_fit_goes_to_the_backlog_with_a_reason(client: TestClient) -> None:
    # Lock Uobei (open 11 AM) at 8:45 AM: it can't be open then, so the solver must drop it.
    client.post(
        "/api/trips/demo/edits",
        json={"type": "updateStop", "dayNumber": 2, "stopId": "d2s6", "changes": {"lockedAtMin": 525}},
    )
    result = optimize(client)
    assert [d["placeId"] for d in result["dropped"]] == ["uobei"]
    assert result["trip"]["backlog"][0]["placeId"] == "uobei"
    assert result["trip"]["backlog"][0]["reason"] == "Its locked time can't be reached along with the other stops."


def test_empty_and_unknown_days(client: TestClient) -> None:
    assert optimize(client, day=4)["dropped"] == []
    assert client.post("/api/trips/demo/days/99/optimize").status_code == 404

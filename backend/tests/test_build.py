from typing import Any

from fastapi.testclient import TestClient

from pinpoint.plan.build import DayToFill, PlaceToPlan, assign_days
from pinpoint.plan.defaults import STOP_COLOR_CYCLE, default_stay_minutes

# ---------- Sorting places into days, on its own ----------


def place(pid: str, lat: float, lng: float, city: str = "Tokyo", stay: int = 60) -> PlaceToPlan:
    return PlaceToPlan(pid, city, lat, lng, stay)


def test_places_only_go_on_days_in_their_city() -> None:
    result = assign_days(
        [
            place("tokyo-a", 35.68, 139.70),
            place("kyoto-a", 35.0, 135.76, city="Kyoto"),
            place("osaka-a", 34.67, 135.5, city="Osaka"),
        ],
        [DayToFill(1, "Tokyo", 600), DayToFill(2, "Kyoto", 600)],
    )
    assert result.days == {1: ["tokyo-a"], 2: ["kyoto-a"]}
    assert result.unplaced == {"osaka-a": "No day in Osaka on this trip."}


def test_nearby_places_share_a_day() -> None:
    shibuya = [place("s1", 35.659, 139.700), place("s2", 35.661, 139.702), place("s3", 35.658, 139.698)]
    asakusa = [place("a1", 35.714, 139.796), place("a2", 35.715, 139.794), place("a3", 35.712, 139.798)]
    result = assign_days(shibuya + asakusa, [DayToFill(1, "Tokyo", 720), DayToFill(2, "Tokyo", 720)])
    days = [set(ids) for ids in result.days.values()]
    assert {"s1", "s2", "s3"} in days
    assert {"a1", "a2", "a3"} in days


def test_an_overfull_day_gives_its_farthest_place_to_a_day_with_room() -> None:
    # Three long stops near each other and one far away; the short day can hold only one.
    near = [place("n1", 35.66, 139.70, stay=180), place("n2", 35.661, 139.701, stay=180)]
    far = [place("far", 35.70, 139.77, stay=60)]
    result = assign_days(near + far, [DayToFill(1, "Tokyo", 300), DayToFill(2, "Tokyo", 600)])
    assert sum(len(ids) for ids in result.days.values()) == 3
    for ids in result.days.values():
        stays = {"n1": 180, "n2": 180, "far": 60}
        assert sum(stays[i] + 25 for i in ids) <= 600


def test_defaults_match_the_frontend() -> None:
    # Same values as frontend/src/domain/tripEdits.test.ts "uses the same stop defaults as the backend".
    assert default_stay_minutes(["eat", "explore"]) == 90
    assert default_stay_minutes(["experience"]) == 120
    assert default_stay_minutes([]) == 60
    assert STOP_COLOR_CYCLE == ("green", "blue", "amber", "ink")


# ---------- Build itinerary through the API, on the sample trip ----------


def trip(client: TestClient) -> dict[str, Any]:
    return client.get("/api/trips/demo").json()


def build(client: TestClient, place_ids: list[str]) -> dict[str, Any]:
    response = client.post("/api/trips/demo/build", json={"includedPlaceIds": place_ids})
    assert response.status_code == 200, response.text
    return response.json()


def everything_saved(client: TestClient) -> list[str]:
    return [sp["placeId"] for sp in trip(client)["savedPlaces"]]


def test_build_puts_each_place_on_a_day_in_its_city(client: TestClient) -> None:
    result = build(client, everything_saved(client))
    t = result["trip"]
    city_of_stay = {s["id"]: s["city"] for s in t["stays"]}
    for day in t["days"]:
        for stop in day["stops"]:
            assert t["places"][stop["placeId"]]["city"] == city_of_stay[day["stayId"]], (day["number"], stop["placeId"])


def test_build_keeps_locked_stops_and_comments(client: TestClient) -> None:
    t = build(client, everything_saved(client))["trip"]
    day2 = next(d for d in t["days"] if d["number"] == 2)
    teamlab = next(s for s in day2["stops"] if s["placeId"] == "teamlab")
    assert teamlab["lockedAtMin"] == 660
    assert teamlab["comments"][0]["body"] == "QR tickets are in the confirmation email."


def test_places_in_cities_without_a_day_go_to_the_backlog_with_a_reason(client: TestClient) -> None:
    result = build(client, everything_saved(client))
    reasons = {b["placeId"]: b["reason"] for b in result["trip"]["backlog"]}
    assert reasons["dotonbori"] == "No day in Osaka on this trip."
    assert reasons["gwangjang"] == "No day in Seoul on this trip."


def test_unchecked_places_leave_the_trip_and_are_remembered(client: TestClient) -> None:
    t = build(client, ["tsukiji", "ichiran", "fushimi"])["trip"]
    on_days = {s["placeId"] for d in t["days"] for s in d["stops"]}
    assert on_days == {"tsukiji", "ichiran", "fushimi", "teamlab"}  # teamLab is locked, so it stays.
    included = {sp["placeId"] for sp in t["savedPlaces"] if sp["included"]}
    assert included == {"tsukiji", "ichiran", "fushimi"}


def test_undo_restores_every_day_and_the_backlog(client: TestClient) -> None:
    before = trip(client)
    result = build(client, everything_saved(client))
    response = client.post(
        "/api/trips/demo/edits",
        json={"type": "restorePlan", "days": result["previous"]["days"], "backlog": result["previous"]["backlog"]},
    )
    assert response.status_code == 200
    after = response.json()
    assert after["days"] == before["days"]
    assert after["backlog"] == before["backlog"]

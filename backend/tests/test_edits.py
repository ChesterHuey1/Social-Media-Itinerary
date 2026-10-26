"""The same cases as frontend/src/domain/tripEdits.test.ts, against the saved copy.
Each edit goes through the API and is read back with a fresh GET, so these test what was stored."""

from typing import Any

from fastapi.testclient import TestClient


def edit(client: TestClient, body: dict[str, Any], status: int = 200) -> dict[str, Any]:
    response = client.post("/api/trips/demo/edits", json=body)
    assert response.status_code == status, response.text
    return response.json()


def day(client: TestClient, number: int) -> dict[str, Any]:
    trip = client.get("/api/trips/demo").json()
    return next(d for d in trip["days"] if d["number"] == number)


def stop_ids(client: TestClient, number: int = 2) -> list[str]:
    return [s["id"] for s in day(client, number)["stops"]]


def test_move_stop_saves_the_new_order(client: TestClient) -> None:
    edit(client, {"type": "moveStop", "dayNumber": 2, "fromIndex": 0, "toIndex": 2})
    assert stop_ids(client) == ["d2s2", "d2s3", "d2s1", "d2s4", "d2s5", "d2s6"]


def test_move_past_either_end_changes_nothing(client: TestClient) -> None:
    before = stop_ids(client)
    edit(client, {"type": "moveStop", "dayNumber": 2, "fromIndex": 5, "toIndex": 6})
    edit(client, {"type": "moveStop", "dayNumber": 2, "fromIndex": -1, "toIndex": 0})
    assert stop_ids(client) == before


def test_update_stop_changes_only_the_fields_sent(client: TestClient) -> None:
    edit(
        client,
        {
            "type": "updateStop",
            "dayNumber": 2,
            "stopId": "d2s3",
            "changes": {"title": "Ramen lunch", "stay": {"minutes": 90, "source": "user"}},
        },
    )
    stop = day(client, 2)["stops"][2]
    assert stop["title"] == "Ramen lunch"
    assert stop["stay"] == {"minutes": 90, "source": "user"}
    assert stop["color"] == "green"
    assert stop["objectives"] == ["eat"]


def test_sending_null_clears_the_title_and_unlocks(client: TestClient) -> None:
    edit(client, {"type": "updateStop", "dayNumber": 2, "stopId": "d2s2", "changes": {"title": "Tickets!"}})
    edit(
        client,
        {"type": "updateStop", "dayNumber": 2, "stopId": "d2s2", "changes": {"title": None, "lockedAtMin": None}},
    )
    stop = day(client, 2)["stops"][1]
    assert stop["title"] is None
    assert stop["lockedAtMin"] is None


def test_comment_is_trimmed_and_an_empty_one_is_dropped(client: TestClient) -> None:
    base = {"type": "addComment", "dayNumber": 2, "stopId": "d2s1", "createdAt": "2026-10-25"}
    edit(client, {**base, "commentId": "c-a", "body": "  Bring cash  "})
    edit(client, {**base, "commentId": "c-b", "body": "   "})
    assert day(client, 2)["stops"][0]["comments"] == [{"id": "c-a", "body": "Bring cash", "createdAt": "2026-10-25"}]


def test_backlog_round_trip(client: TestClient) -> None:
    trip = edit(client, {"type": "moveToBacklog", "dayNumber": 2, "stopId": "d2s4"})
    assert "d2s4" not in stop_ids(client)
    assert trip["backlog"][0] == {"placeId": "shibuyaSky", "reason": "Moved here from Day 2."}

    new_stop = {
        "id": "new-stop",
        "placeId": "shibuyaSky",
        "title": None,
        "color": "blue",
        "objectives": ["explore", "pictures"],
        "stay": {"minutes": 90, "source": "estimate"},
        "lockedAtMin": None,
        "comments": [],
    }
    trip = edit(client, {"type": "addFromBacklog", "dayNumber": 2, "stop": new_stop})
    assert stop_ids(client)[-1] == "new-stop"
    assert all(b["placeId"] != "shibuyaSky" for b in trip["backlog"])


def test_adding_a_place_that_is_not_in_the_backlog_is_rejected(client: TestClient) -> None:
    stop = {
        "id": "x",
        "placeId": "tsukiji",
        "title": None,
        "color": "green",
        "objectives": [],
        "stay": {"minutes": 60, "source": "estimate"},
        "lockedAtMin": None,
        "comments": [],
    }
    edit(client, {"type": "addFromBacklog", "dayNumber": 2, "stop": stop}, status=409)


def test_unknown_stop_or_day_is_rejected(client: TestClient) -> None:
    edit(client, {"type": "moveToBacklog", "dayNumber": 2, "stopId": "nope"}, status=409)
    edit(client, {"type": "moveStop", "dayNumber": 99, "fromIndex": 0, "toIndex": 1}, status=409)


def test_bad_values_never_reach_the_database(client: TestClient) -> None:
    edit(client, {"type": "updateStop", "dayNumber": 2, "stopId": "d2s1", "changes": {"color": "purple"}}, status=422)
    edit(
        client,
        {"type": "updateStop", "dayNumber": 2, "stopId": "d2s1", "changes": {"stay": {"minutes": 0, "source": "user"}}},
        status=422,
    )
    edit(client, {"type": "renameTrip", "name": "x"}, status=422)


def test_edit_on_unknown_trip_is_404(client: TestClient) -> None:
    response = client.post(
        "/api/trips/nope/edits", json={"type": "moveStop", "dayNumber": 2, "fromIndex": 0, "toIndex": 1}
    )
    assert response.status_code == 404


def test_move_to_day_puts_the_stop_last_on_the_other_day_and_unlocks_it(client: TestClient) -> None:
    moved = next(s for s in day(client, 2)["stops"] if s["id"] == "d2s2")
    assert moved["lockedAtMin"] == 660
    edit(client, {"type": "moveToDay", "dayNumber": 2, "stopId": "d2s2", "toDayNumber": 3})
    assert "d2s2" not in stop_ids(client, 2)
    assert stop_ids(client, 3)[-1] == "d2s2"
    assert day(client, 3)["stops"][-1] == {**moved, "lockedAtMin": None}


def test_move_to_the_same_day_changes_nothing_and_a_missing_day_is_refused(client: TestClient) -> None:
    before = stop_ids(client)
    edit(client, {"type": "moveToDay", "dayNumber": 2, "stopId": "d2s2", "toDayNumber": 2})
    assert stop_ids(client) == before
    edit(client, {"type": "moveToDay", "dayNumber": 2, "stopId": "d2s2", "toDayNumber": 9}, status=409)

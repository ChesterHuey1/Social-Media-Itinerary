import json

from fastapi.testclient import TestClient

from pinpoint.seed import DEMO_FILE


def test_get_trip_returns_exactly_what_was_seeded(client: TestClient) -> None:
    """The stored trip comes back in the frontend's shape, field for field."""
    response = client.get("/api/trips/demo")
    assert response.status_code == 200
    assert response.json() == json.loads(DEMO_FILE.read_text(encoding="utf-8"))


def test_unknown_trip_is_404(client: TestClient) -> None:
    assert client.get("/api/trips/nope").status_code == 404


def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}

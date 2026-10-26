import time

from conftest import TEST_PASSWORD
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from pinpoint import auth
from pinpoint.main import app

OPEN_ROUTES = {"/api/health", "/api/auth/login", "/api/auth/logout", "/api/auth/me"}


def test_every_api_route_needs_a_session() -> None:
    for route in app.routes:
        if not isinstance(route, APIRoute) or route.path in OPEN_ROUTES:
            continue
        calls = {d.call for d in route.dependant.dependencies}
        assert auth.require_session in calls, f"{route.path} is open to anyone"


def test_signed_out_requests_are_refused(anon_client: TestClient) -> None:
    assert anon_client.get("/api/trips/demo").status_code == 401
    assert anon_client.get("/api/auth/me").status_code == 401
    assert anon_client.get("/api/health").status_code == 200


def test_sign_in_sets_a_cookie_that_opens_the_api(anon_client: TestClient) -> None:
    response = anon_client.post("/api/auth/login", json={"password": TEST_PASSWORD})
    assert response.status_code == 204
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert anon_client.get("/api/auth/me").status_code == 204
    assert anon_client.get("/api/trips/demo").status_code == 200


def test_sign_out_clears_the_cookie(client: TestClient) -> None:
    client.post("/api/auth/logout")
    assert client.get("/api/trips/demo").status_code == 401


def test_wrong_password_is_refused_then_rate_limited(anon_client: TestClient) -> None:
    for _ in range(auth.MAX_FAILURES):
        assert anon_client.post("/api/auth/login", json={"password": "nope"}).status_code == 401
    # Even the right password waits once there have been too many wrong ones.
    assert anon_client.post("/api/auth/login", json={"password": TEST_PASSWORD}).status_code == 429


def test_forged_and_expired_tokens_are_refused() -> None:
    token, _ = auth.new_session_token()
    expires, signature = token.split(".")
    assert auth.session_is_valid(token)
    assert not auth.session_is_valid(f"{int(expires) + 999}.{signature}")
    assert not auth.session_is_valid(token, now=time.time() + auth.SESSION_DAYS * 24 * 3600 + 1)
    assert not auth.session_is_valid("garbage")


def test_password_hash_round_trip() -> None:
    stored = auth.hash_password("a long password")
    assert auth.password_matches("a long password", stored)
    assert not auth.password_matches("a long passwore", stored)
    assert not auth.password_matches("x", "not-a-hash")

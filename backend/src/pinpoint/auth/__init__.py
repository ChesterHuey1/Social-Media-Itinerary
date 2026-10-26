"""Login for the one user (spec: "One account. Password hash in .env, session cookie, HTTPS only").

- The password is checked against APP_PASSWORD_HASH (scrypt, from Python's standard library).
- A good password gets a signed session cookie: "<expiry>.<HMAC of the expiry with SESSION_SECRET>".
  Nothing is stored on the server; changing SESSION_SECRET signs every browser out.
- Every /api route except sign-in and health depends on `require_session`; tests/test_auth.py fails if one doesn't.
"""

import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from pinpoint.config import get_settings

COOKIE_NAME = "pinpoint_session"
SESSION_DAYS = 30
SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_LEN = 2**14, 8, 1, 32
MAX_FAILURES = 5
FAILURE_WINDOW_S = 10 * 60

_failures: dict[str, deque[float]] = defaultdict(deque)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=SCRYPT_LEN)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def password_matches(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    candidate = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=len(bytes.fromhex(digest))
    )
    return hmac.compare_digest(candidate.hex(), digest)


def _signature(expires: int, secret: str) -> str:
    return hmac.new(secret.encode(), f"v1.{expires}".encode(), hashlib.sha256).hexdigest()


def new_session_token(now: float | None = None) -> tuple[str, int]:
    """A token and its lifetime in seconds."""
    lifetime = SESSION_DAYS * 24 * 3600
    expires = int((now or time.time()) + lifetime)
    return f"{expires}.{_signature(expires, get_settings().session_secret)}", lifetime


def session_is_valid(token: str | None, now: float | None = None) -> bool:
    secret = get_settings().session_secret
    if not token or not secret or "." not in token:
        return False
    expires, signature = token.split(".", 1)
    if not expires.isdigit() or int(expires) < (now or time.time()):
        return False
    return hmac.compare_digest(signature, _signature(int(expires), secret))


def too_many_failures(client: str, now: float | None = None) -> bool:
    now = now or time.time()
    recent = _failures[client]
    while recent and recent[0] < now - FAILURE_WINDOW_S:
        recent.popleft()
    return len(recent) >= MAX_FAILURES


def record_failure(client: str, now: float | None = None) -> None:
    _failures[client].append(now or time.time())


def require_session(request: Request) -> None:
    """FastAPI dependency for every protected route."""
    if not session_is_valid(request.cookies.get(COOKIE_NAME)):
        raise HTTPException(401, "Sign in first.")

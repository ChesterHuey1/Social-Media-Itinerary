from fastapi import APIRouter, HTTPException, Request, Response

from pinpoint import auth
from pinpoint.config import get_settings
from pinpoint.schemas import Schema

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignIn(Schema):
    password: str


@router.post("/login", status_code=204)
def login(body: SignIn, request: Request, response: Response) -> None:
    settings = get_settings()
    client = request.client.host if request.client else "unknown"
    if not settings.app_password_hash or not settings.session_secret:
        raise HTTPException(503, "No password set. Run: uv run python -m pinpoint.auth set-password")
    if auth.too_many_failures(client):
        raise HTTPException(429, "Too many wrong passwords. Wait 10 minutes and try again.")
    if not auth.password_matches(body.password, settings.app_password_hash):
        auth.record_failure(client)
        raise HTTPException(401, "That password is wrong.")
    token, lifetime = auth.new_session_token()
    response.set_cookie(
        auth.COOKIE_NAME,
        token,
        max_age=lifetime,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


@router.post("/logout", status_code=204)
def logout(response: Response) -> None:
    response.delete_cookie(auth.COOKIE_NAME, path="/")


@router.get("/me", status_code=204)
def me(request: Request) -> None:
    """204 when signed in, 401 when not. The browser asks this to decide whether to show sign-in."""
    auth.require_session(request)

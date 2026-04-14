import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.spotify import (
    build_spotify_authorize_url,
    exchange_spotify_code,
    save_spotify_connection,
    verify_spotify_state,
)
from app.models.user import SpotifyConnection, User
from app.schemas.spotify import SpotifyLoginOut, SpotifyStatusOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/spotify", tags=["spotify"])


def _frontend_redirect(status: str) -> RedirectResponse:
    frontend_url = settings.FRONTEND_URL.rstrip("/") or "http://localhost:8080"
    separator = "&" if "?" in frontend_url else "?"
    return RedirectResponse(f"{frontend_url}{separator}spotify={status}", status_code=302)


@router.get("/login", response_model=SpotifyLoginOut)
def spotify_login(current_user: User = Depends(get_current_user)):
    return SpotifyLoginOut(url=build_spotify_authorize_url(current_user.id))


@router.get("/callback")
def spotify_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    if error:
        logger.info("Spotify OAuth callback returned error: %s", error)
        return _frontend_redirect("error")
    if not code or not state:
        return _frontend_redirect("error")

    try:
        user_id = verify_spotify_state(state)
        if db.get(User, user_id) is None:
            raise ValueError("Spotify state references an unknown user")
        token_payload = exchange_spotify_code(code)
        save_spotify_connection(db, user_id, token_payload)
    except (HTTPException, ValueError) as exc:
        db.rollback()
        logger.warning("Spotify OAuth callback failed: %s", exc)
        return _frontend_redirect("error")

    return _frontend_redirect("connected")


@router.get("/status", response_model=SpotifyStatusOut)
def spotify_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    connection = db.get(SpotifyConnection, current_user.id)
    if connection is None:
        return SpotifyStatusOut(connected=False)
    return SpotifyStatusOut(
        connected=True,
        expires_at=connection.expires_at,
        scope=connection.scope or "",
    )


@router.post("/disconnect", response_model=SpotifyStatusOut)
def spotify_disconnect(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    connection = db.get(SpotifyConnection, current_user.id)
    if connection is not None:
        db.delete(connection)
        db.commit()
    return SpotifyStatusOut(connected=False)

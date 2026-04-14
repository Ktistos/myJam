import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen as _urlopen

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import SpotifyConnection

SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_TIMEOUT_SECONDS = 8
SPOTIFY_STATE_TTL_SECONDS = 600
SPOTIFY_TOKEN_REFRESH_SKEW_SECONDS = 60
SPOTIFY_SCOPES = "playlist-read-private playlist-read-collaborative"

urlopen = _urlopen


def spotify_credentials() -> tuple[str, str] | None:
    client_id = (settings.SPOTIFY_CLIENT_ID or "").strip()
    client_secret = (settings.SPOTIFY_CLIENT_SECRET or "").strip()
    if not client_id or not client_secret:
        return None
    return client_id, client_secret


def require_spotify_credentials() -> tuple[str, str]:
    credentials = spotify_credentials()
    if credentials is None:
        raise HTTPException(status_code=400, detail="Spotify API is not configured")
    return credentials


def _basic_auth_header(client_id: str, client_secret: str) -> str:
    token = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def _state_secret() -> bytes:
    client_secret = (settings.SPOTIFY_CLIENT_SECRET or "").strip()
    firebase_project = (settings.FIREBASE_PROJECT_ID or "").strip()
    return f"{client_secret}:{firebase_project}".encode("utf-8")


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _base64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(f"{data}{padding}")


def sign_spotify_state(user_id: str, now: int | None = None) -> str:
    payload = {
        "uid": user_id,
        "iat": now if now is not None else int(time.time()),
        "nonce": secrets.token_urlsafe(16),
    }
    payload_b64 = _base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(_state_secret(), payload_b64.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{signature}"


def verify_spotify_state(state: str, now: int | None = None) -> str:
    try:
        payload_b64, signature = state.split(".", 1)
    except ValueError as exc:
        raise ValueError("Invalid Spotify state") from exc

    expected = hmac.new(_state_secret(), payload_b64.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise ValueError("Invalid Spotify state")

    try:
        payload = json.loads(_base64url_decode(payload_b64))
        issued_at = int(payload["iat"])
        user_id = str(payload["uid"]).strip()
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid Spotify state") from exc

    current_time = now if now is not None else int(time.time())
    if not user_id or issued_at > current_time + 60 or current_time - issued_at > SPOTIFY_STATE_TTL_SECONDS:
        raise ValueError("Expired Spotify state")
    return user_id


def build_spotify_authorize_url(user_id: str) -> str:
    client_id, _client_secret = require_spotify_credentials()
    redirect_uri = settings.SPOTIFY_REDIRECT_URI.strip()
    if not redirect_uri:
        raise HTTPException(status_code=400, detail="Spotify redirect URI is not configured")

    return f"{SPOTIFY_AUTHORIZE_URL}?{urlencode({
        'response_type': 'code',
        'client_id': client_id,
        'scope': SPOTIFY_SCOPES,
        'redirect_uri': redirect_uri,
        'state': sign_spotify_state(user_id),
    })}"


def request_spotify_token(form: dict[str, str]) -> dict:
    client_id, client_secret = require_spotify_credentials()
    request = Request(
        SPOTIFY_TOKEN_URL,
        data=urlencode(form).encode("utf-8"),
        headers={
            "Authorization": _basic_auth_header(client_id, client_secret),
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "myJam/1.0",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=SPOTIFY_API_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Could not authenticate with Spotify API") from exc


def exchange_spotify_code(code: str) -> dict:
    return request_spotify_token(
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.SPOTIFY_REDIRECT_URI.strip(),
        }
    )


def _expires_at(payload: dict) -> datetime:
    try:
        expires_in = int(payload.get("expires_in", 3600))
    except (TypeError, ValueError):
        expires_in = 3600
    return datetime.now(timezone.utc) + timedelta(seconds=max(expires_in, 0))


def _normalise_expiry(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def save_spotify_connection(db: Session, user_id: str, payload: dict) -> SpotifyConnection:
    access_token = str(payload.get("access_token") or "").strip()
    refresh_token = str(payload.get("refresh_token") or "").strip()
    if not access_token or not refresh_token:
        raise HTTPException(status_code=400, detail="Spotify did not return usable OAuth tokens")

    connection = db.get(SpotifyConnection, user_id)
    if connection is None:
        connection = SpotifyConnection(user_id=user_id)
        db.add(connection)

    connection.access_token = access_token
    connection.refresh_token = refresh_token
    connection.scope = str(payload.get("scope") or "")
    connection.expires_at = _expires_at(payload)
    db.commit()
    db.refresh(connection)
    return connection


def refresh_spotify_connection(db: Session, connection: SpotifyConnection) -> SpotifyConnection | None:
    refresh_token = (connection.refresh_token or "").strip()
    if not refresh_token:
        return None

    try:
        payload = request_spotify_token(
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            }
        )
    except HTTPException:
        return None

    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        return None

    connection.access_token = access_token
    connection.refresh_token = str(payload.get("refresh_token") or refresh_token).strip()
    connection.scope = str(payload.get("scope") or connection.scope or "")
    connection.expires_at = _expires_at(payload)
    db.commit()
    db.refresh(connection)
    return connection


def get_fresh_user_spotify_access_token(db: Session, user_id: str) -> str | None:
    connection = db.get(SpotifyConnection, user_id)
    if connection is None:
        return None

    refresh_after = datetime.now(timezone.utc) + timedelta(seconds=SPOTIFY_TOKEN_REFRESH_SKEW_SECONDS)
    if _normalise_expiry(connection.expires_at) > refresh_after:
        return connection.access_token

    refreshed = refresh_spotify_connection(db, connection)
    return refreshed.access_token if refreshed else None

import json
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

from app.core import spotify as spotify_core
from app.models.user import SpotifyConnection


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.body.encode("utf-8")


def _enable_spotify(monkeypatch):
    monkeypatch.setattr(spotify_core.settings, "SPOTIFY_CLIENT_ID", "client-id")
    monkeypatch.setattr(spotify_core.settings, "SPOTIFY_CLIENT_SECRET", "client-secret")
    monkeypatch.setattr(spotify_core.settings, "SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8000/spotify/callback")
    monkeypatch.setattr(spotify_core.settings, "FRONTEND_URL", "http://localhost:8080")


def test_spotify_login_returns_signed_authorize_url(client_a, monkeypatch):
    _enable_spotify(monkeypatch)

    resp = client_a.get("/spotify/login")

    assert resp.status_code == 200
    authorize_url = resp.json()["url"]
    parsed = urlparse(authorize_url)
    query = parse_qs(parsed.query)
    assert parsed.netloc == "accounts.spotify.com"
    assert query["client_id"] == ["client-id"]
    assert query["redirect_uri"] == ["http://127.0.0.1:8000/spotify/callback"]
    assert query["scope"] == ["playlist-read-private playlist-read-collaborative"]
    assert spotify_core.verify_spotify_state(query["state"][0]) == "uid-a"


def test_spotify_callback_stores_tokens_and_redirects(client_a, db_session, monkeypatch):
    _enable_spotify(monkeypatch)
    state = spotify_core.sign_spotify_state("uid-a", now=int(time.time()))

    def fake_urlopen(request, timeout):
        del timeout
        body = parse_qs(request.data.decode("utf-8"))
        assert request.full_url == spotify_core.SPOTIFY_TOKEN_URL
        assert body["grant_type"] == ["authorization_code"]
        assert body["code"] == ["spotify-code"]
        assert body["redirect_uri"] == ["http://127.0.0.1:8000/spotify/callback"]
        return FakeResponse(json.dumps({
            "access_token": "access-token",
            "refresh_token": "refresh-token",
            "expires_in": 3600,
            "scope": "playlist-read-private",
        }))

    monkeypatch.setattr(spotify_core, "urlopen", fake_urlopen)

    resp = client_a.get(
        "/spotify/callback",
        params={"code": "spotify-code", "state": state},
        follow_redirects=False,
    )

    assert resp.status_code == 302
    assert resp.headers["location"] == "http://localhost:8080?spotify=connected"
    connection = db_session.get(SpotifyConnection, "uid-a")
    assert connection is not None
    assert connection.access_token == "access-token"
    assert connection.refresh_token == "refresh-token"
    assert connection.scope == "playlist-read-private"


def test_spotify_status_and_disconnect(client_a, db_session, user_a):
    db_session.add(SpotifyConnection(
        user_id=user_a.id,
        access_token="access-token",
        refresh_token="refresh-token",
        scope="playlist-read-private",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    ))
    db_session.commit()

    status_resp = client_a.get("/spotify/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["connected"] is True

    disconnect_resp = client_a.post("/spotify/disconnect")
    assert disconnect_resp.status_code == 200
    assert disconnect_resp.json() == {"connected": False, "expires_at": None, "scope": None}
    assert db_session.get(SpotifyConnection, user_a.id) is None


def test_spotify_callback_rejects_bad_state(client_a, db_session, monkeypatch):
    _enable_spotify(monkeypatch)

    resp = client_a.get(
        "/spotify/callback",
        params={"code": "spotify-code", "state": "bad-state"},
        follow_redirects=False,
    )

    assert resp.status_code == 302
    assert resp.headers["location"] == "http://localhost:8080?spotify=error"
    assert db_session.get(SpotifyConnection, "uid-a") is None

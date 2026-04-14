"""Tests for song metadata import endpoints."""
import base64
import json
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.parse import parse_qs

from app.api.routers import songs as songs_router
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


def _fake_urlopen_for(mapping):
    def fake_urlopen(request, timeout):
        del timeout
        url = request.full_url
        for key, value in mapping.items():
            if key in url:
                return FakeResponse(value)
        raise AssertionError(f"Unexpected URL: {url}")

    return fake_urlopen


def _enable_spotify_api(monkeypatch, market="US"):
    monkeypatch.setattr(songs_router.settings, "SPOTIFY_CLIENT_ID", "client-id")
    monkeypatch.setattr(songs_router.settings, "SPOTIFY_CLIENT_SECRET", "client-secret")
    monkeypatch.setattr(songs_router.settings, "SPOTIFY_MARKET", market)
    monkeypatch.setattr(songs_router, "_spotify_access_token", None)
    monkeypatch.setattr(songs_router, "_spotify_access_token_expires_at", 0.0)


def test_extract_meta_content_works_when_content_attribute_comes_first():
    html = (
        '<html><head><meta content="Little Wing - song and lyrics by '
        'Jimi Hendrix | Spotify" property="og:title"></head></html>'
    )

    assert songs_router._extract_meta_content(
        html,
        "og:title",
    ) == "Little Wing - song and lyrics by Jimi Hendrix | Spotify"


def test_import_spotify_track_metadata_uses_oembed_and_artist_fallback(client_a, monkeypatch):
    monkeypatch.setattr(
        songs_router,
        "urlopen",
        _fake_urlopen_for(
            {
                "open.spotify.com/oembed": json.dumps({"title": "Little Wing"}),
                "open.spotify.com/track": (
                    '<html><head><title>Little Wing - song and lyrics by '
                    "Jimi Hendrix | Spotify</title></head></html>"
                ),
            }
        ),
    )

    resp = client_a.post(
        "/songs/import/metadata",
        json={"url": "https://open.spotify.com/track/abc123"},
    )

    assert resp.status_code == 200
    assert resp.json() == {
        "title": "Little Wing",
        "artist": "Jimi Hendrix",
        "service": "Spotify",
        "original_url": "https://open.spotify.com/track/abc123",
    }


def test_import_spotify_track_metadata_uses_api_when_configured(client_a, monkeypatch):
    _enable_spotify_api(monkeypatch)
    requests = []

    def fake_urlopen(request, timeout):
        del timeout
        requests.append(request)
        url = request.full_url
        if "accounts.spotify.com/api/token" in url:
            assert request.data == b"grant_type=client_credentials"
            assert request.get_header("Authorization", "").startswith("Basic ")
            return FakeResponse(json.dumps({"access_token": "spotify-token", "expires_in": 3600}))
        if "api.spotify.com/v1/tracks/abc123" in url:
            assert request.get_header("Authorization") == "Bearer spotify-token"
            assert "market=US" in url
            return FakeResponse(
                json.dumps(
                    {
                        "type": "track",
                        "name": "Little Wing",
                        "artists": [{"name": "Jimi Hendrix"}],
                    }
                )
            )
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(songs_router, "urlopen", fake_urlopen)

    resp = client_a.post(
        "/songs/import/metadata",
        json={"url": "https://open.spotify.com/track/abc123"},
    )

    assert resp.status_code == 200
    assert resp.json() == {
        "title": "Little Wing",
        "artist": "Jimi Hendrix",
        "service": "Spotify",
        "original_url": "https://open.spotify.com/track/abc123",
    }
    assert all("open.spotify.com/oembed" not in request.full_url for request in requests)


def test_import_youtube_video_metadata_uses_oembed_author(client_a, monkeypatch):
    monkeypatch.setattr(
        songs_router,
        "urlopen",
        _fake_urlopen_for(
            {
                "youtube.com/oembed": json.dumps(
                    {"title": "Redbone", "author_name": "Childish Gambino"}
                ),
            }
        ),
    )

    resp = client_a.post(
        "/songs/import/metadata",
        json={"url": "https://www.youtube.com/watch?v=abc123"},
    )

    assert resp.status_code == 200
    assert resp.json()["title"] == "Redbone"
    assert resp.json()["artist"] == "Childish Gambino"
    assert resp.json()["service"] == "YouTube"


def test_import_spotify_playlist_reads_tracks_from_page_json(client_a, monkeypatch):
    spotify_html = """
    <html><head><script id="__NEXT_DATA__" type="application/json">
    {
      "props": {
        "pageProps": {
          "state": {
            "tracks": [
              {"type": "track", "name": "Little Wing", "artists": [{"name": "Jimi Hendrix"}]},
              {"type": "track", "title": "Redbone", "subtitle": "Childish Gambino"}
            ]
          }
        }
      }
    }
    </script></head></html>
    """
    monkeypatch.setattr(
        songs_router,
        "urlopen",
        _fake_urlopen_for({"open.spotify.com/playlist": spotify_html}),
    )

    resp = client_a.post(
        "/songs/import/playlist",
        json={"url": "https://open.spotify.com/playlist/abc123"},
    )

    assert resp.status_code == 200
    assert resp.json() == {
        "service": "Spotify",
        "original_url": "https://open.spotify.com/playlist/abc123",
        "songs": [
            {"title": "Little Wing", "artist": "Jimi Hendrix"},
            {"title": "Redbone", "artist": "Childish Gambino"},
        ],
    }


def test_import_spotify_playlist_uses_api_when_configured(client_a, monkeypatch):
    _enable_spotify_api(monkeypatch)
    requests = []

    def fake_urlopen(request, timeout):
        del timeout
        requests.append(request)
        url = request.full_url
        if "accounts.spotify.com/api/token" in url:
            return FakeResponse(json.dumps({"access_token": "spotify-token", "expires_in": 3600}))
        if "api.spotify.com/v1/playlists/abc123/items" in url:
            assert request.get_header("Authorization") == "Bearer spotify-token"
            assert "market=US" in url
            if "offset=0" in url:
                return FakeResponse(
                    json.dumps(
                        {
                            "items": [
                                {
                                    "track": {
                                        "type": "track",
                                        "name": "Little Wing",
                                        "artists": [{"name": "Jimi Hendrix"}],
                                    }
                                },
                                {
                                    "track": {
                                        "type": "track",
                                        "name": "Use Me",
                                        "artists": [{"name": "Bill Withers"}],
                                    }
                                },
                            ],
                            "next": "next-page",
                            "total": 3,
                        }
                    )
                )
            if "offset=2" in url:
                return FakeResponse(
                    json.dumps(
                        {
                            "items": [
                                {
                                    "track": {
                                        "type": "track",
                                        "name": "Redbone",
                                        "artists": [{"name": "Childish Gambino"}],
                                    }
                                },
                            ],
                            "next": None,
                            "total": 3,
                        }
                    )
                )
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(songs_router, "urlopen", fake_urlopen)

    resp = client_a.post(
        "/songs/import/playlist",
        json={"url": "https://open.spotify.com/playlist/abc123"},
    )

    assert resp.status_code == 200
    assert resp.json() == {
        "service": "Spotify",
        "original_url": "https://open.spotify.com/playlist/abc123",
        "songs": [
            {"title": "Little Wing", "artist": "Jimi Hendrix"},
            {"title": "Use Me", "artist": "Bill Withers"},
            {"title": "Redbone", "artist": "Childish Gambino"},
        ],
    }
    playlist_api_requests = [
        request for request in requests if "api.spotify.com/v1/playlists/abc123/items" in request.full_url
    ]
    assert len(playlist_api_requests) == 2


def test_import_spotify_playlist_falls_back_to_page_parser_when_api_denied(client_a, monkeypatch):
    _enable_spotify_api(monkeypatch)
    spotify_html = """
    <html><head><script type="application/json">
    {"tracks": [{"type": "track", "name": "Fallback Song", "artists": [{"name": "Fallback Artist"}]}]}
    </script></head></html>
    """

    def fake_urlopen(request, timeout):
        del timeout
        url = request.full_url
        if "accounts.spotify.com/api/token" in url:
            return FakeResponse(json.dumps({"access_token": "spotify-token", "expires_in": 3600}))
        if "api.spotify.com/v1/playlists/abc123/items" in url:
            raise HTTPError(url, 403, "Forbidden", hdrs=None, fp=None)
        if "open.spotify.com/playlist/abc123" in url:
            return FakeResponse(spotify_html)
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(songs_router, "urlopen", fake_urlopen)

    resp = client_a.post(
        "/songs/import/playlist",
        json={"url": "https://open.spotify.com/playlist/abc123"},
    )

    assert resp.status_code == 200
    assert resp.json()["songs"] == [{"title": "Fallback Song", "artist": "Fallback Artist"}]


def test_import_spotify_playlist_private_prompts_auth_for_logged_in_user(client_a, monkeypatch):
    _enable_spotify_api(monkeypatch)

    def fake_urlopen(request, timeout):
        del timeout
        url = request.full_url
        if "accounts.spotify.com/api/token" in url:
            return FakeResponse(json.dumps({"access_token": "spotify-token", "expires_in": 3600}))
        if "api.spotify.com/v1/playlists/abc123/items" in url:
            raise HTTPError(url, 404, "Not Found", hdrs=None, fp=None)
        if "open.spotify.com/playlist/abc123" in url:
            # HTML fallback: return a login-wall page with no parseable tracks.
            return FakeResponse("<html><head></head><body>Log in to Spotify</body></html>")
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(songs_router, "urlopen", fake_urlopen)

    resp = client_a.post(
        "/songs/import/playlist",
        json={"url": "https://open.spotify.com/playlist/abc123"},
    )

    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert detail["code"] == "spotify_auth_required"
    assert detail["authenticated"] is True
    assert "connect your Spotify account" in detail["message"]


def test_import_spotify_playlist_private_prompts_sign_in_for_anon(anon_client, monkeypatch):
    _enable_spotify_api(monkeypatch)

    def fake_urlopen(request, timeout):
        del timeout
        url = request.full_url
        if "accounts.spotify.com/api/token" in url:
            return FakeResponse(json.dumps({"access_token": "spotify-token", "expires_in": 3600}))
        if "api.spotify.com/v1/playlists/abc123/items" in url:
            raise HTTPError(url, 404, "Not Found", hdrs=None, fp=None)
        if "open.spotify.com/playlist/abc123" in url:
            return FakeResponse("<html><head></head><body>Log in to Spotify</body></html>")
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(songs_router, "urlopen", fake_urlopen)

    resp = anon_client.post(
        "/songs/import/playlist",
        json={"url": "https://open.spotify.com/playlist/abc123"},
    )

    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert detail["code"] == "spotify_auth_required"
    assert detail["authenticated"] is False
    assert "sign in and connect Spotify" in detail["message"]


def test_import_spotify_playlist_uses_user_token_for_private_playlist(client_a, db_session, user_a, monkeypatch):
    _enable_spotify_api(monkeypatch)
    db_session.add(SpotifyConnection(
        user_id=user_a.id,
        access_token="user-token",
        refresh_token="refresh-token",
        scope="playlist-read-private",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    ))
    db_session.commit()

    def fake_urlopen(request, timeout):
        del timeout
        url = request.full_url
        if "api.spotify.com/v1/playlists/abc123/items" in url:
            auth_header = request.get_header("Authorization")
            if auth_header == "Bearer user-token":
                return FakeResponse(
                    json.dumps(
                        {
                            "items": [
                                {
                                    "track": {
                                        "type": "track",
                                        "name": "Private Track",
                                        "artists": [{"name": "Private Artist"}],
                                    }
                                }
                            ],
                            "next": None,
                            "total": 1,
                        }
                    )
                )
            raise HTTPError(url, 404, "Not Found", hdrs=None, fp=None)
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(songs_router, "urlopen", fake_urlopen)

    resp = client_a.post(
        "/songs/import/playlist",
        json={"url": "https://open.spotify.com/playlist/abc123"},
    )

    assert resp.status_code == 200
    assert resp.json()["songs"] == [{"title": "Private Track", "artist": "Private Artist"}]


def test_import_spotify_playlist_without_api_config_falls_through_to_html(anon_client, monkeypatch):
    """When SPOTIFY_CLIENT_ID isn't configured we can't tell private from deleted,
    so we must not falsely prompt for auth — fall through to the HTML scrape."""
    monkeypatch.setattr(songs_router.settings, "SPOTIFY_CLIENT_ID", "")
    monkeypatch.setattr(songs_router.settings, "SPOTIFY_CLIENT_SECRET", "")
    monkeypatch.setattr(songs_router, "_spotify_access_token", None)
    monkeypatch.setattr(songs_router, "_spotify_access_token_expires_at", 0.0)

    spotify_html = """
    <html><head><script type=\"application/json\">
    {\"tracks\": [{\"type\": \"track\", \"name\": \"Public Song\", \"artists\": [{\"name\": \"Public Artist\"}]}]}
    </script></head></html>
    """

    def fake_urlopen(request, timeout):
        del timeout
        url = request.full_url
        if "open.spotify.com/playlist/abc123" in url:
            return FakeResponse(spotify_html)
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(songs_router, "urlopen", fake_urlopen)

    resp = anon_client.post(
        "/songs/import/playlist",
        json={"url": "https://open.spotify.com/playlist/abc123"},
    )

    assert resp.status_code == 200
    assert resp.json()["songs"] == [{"title": "Public Song", "artist": "Public Artist"}]


def test_import_spotify_api_auth_failure_reports_config_problem(client_a, monkeypatch):
    _enable_spotify_api(monkeypatch)

    def fake_urlopen(request, timeout):
        del timeout
        url = request.full_url
        if "accounts.spotify.com/api/token" in url:
            raise HTTPError(url, 401, "Unauthorized", hdrs=None, fp=None)
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(songs_router, "urlopen", fake_urlopen)

    resp = client_a.post(
        "/songs/import/metadata",
        json={"url": "https://open.spotify.com/track/abc123"},
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Could not authenticate with Spotify API"


def test_import_spotify_playlist_reads_base64_initial_state(client_a, monkeypatch):
    initial_state = {
        "entities": {
            "items": {
                "spotify:playlist:abc123": {
                    "content": {
                        "items": [
                            {
                                "itemV2": {
                                    "data": {
                                        "__typename": "Track",
                                        "name": "Risk It All",
                                        "uri": "spotify:track:5y2ijHECwFYWqcAHKTZgzD",
                                        "artists": {
                                            "items": [
                                                {"profile": {"name": "Bruno Mars"}},
                                                {"profile": {"name": "Anderson .Paak"}},
                                            ],
                                        },
                                    },
                                },
                            },
                            {
                                "itemV2": {
                                    "data": {
                                        "__typename": "Track",
                                        "name": "Babydoll",
                                        "uri": "spotify:track:7yNf9YjeO5JXUE3JEBgnYc",
                                        "artists": {
                                            "items": [
                                                {"profile": {"name": "Dominic Fike"}},
                                            ],
                                        },
                                    },
                                },
                            },
                        ],
                    },
                },
            },
        },
    }
    encoded_state = base64.b64encode(json.dumps(initial_state).encode()).decode()
    spotify_html = f"""
    <html><head>
      <script id="initialState" type="text/plain">{encoded_state}</script>
    </head></html>
    """
    monkeypatch.setattr(
        songs_router,
        "urlopen",
        _fake_urlopen_for({"open.spotify.com/playlist": spotify_html}),
    )

    resp = client_a.post(
        "/songs/import/playlist",
        json={"url": "https://open.spotify.com/playlist/abc123"},
    )

    assert resp.status_code == 200
    assert resp.json()["songs"] == [
        {"title": "Risk It All", "artist": "Bruno Mars, Anderson .Paak"},
        {"title": "Babydoll", "artist": "Dominic Fike"},
    ]


def test_import_youtube_playlist_reads_playlist_video_renderers(client_a, monkeypatch):
    youtube_html = """
    <script>
    var ytInitialData = {
      "contents": {
        "items": [
          {"playlistVideoRenderer": {
            "title": {"runs": [{"text": "Use Me"}]},
            "shortBylineText": {"runs": [{"text": "Bill Withers"}]}
          }},
          {"playlistVideoRenderer": {
            "title": {"simpleText": "Valerie"},
            "shortBylineText": {"runs": [{"text": "Amy Winehouse"}]}
          }}
        ]
      }
    };
    </script>
    """
    monkeypatch.setattr(
        songs_router,
        "urlopen",
        _fake_urlopen_for({"youtube.com/playlist": youtube_html}),
    )

    resp = client_a.post(
        "/songs/import/playlist",
        json={"url": "https://www.youtube.com/playlist?list=PL123"},
    )

    assert resp.status_code == 200
    assert resp.json()["service"] == "YouTube"
    assert resp.json()["songs"] == [
        {"title": "Use Me", "artist": "Bill Withers"},
        {"title": "Valerie", "artist": "Amy Winehouse"},
    ]


def test_import_song_metadata_rejects_playlist_urls(client_a):
    resp = client_a.post(
        "/songs/import/metadata",
        json={"url": "https://open.spotify.com/playlist/abc123"},
    )

    assert resp.status_code == 400
    assert "Spotify track link" in resp.json()["detail"]


def test_import_playlist_metadata_rejects_track_urls(client_a, monkeypatch):
    def fail_if_called(_request, _timeout):
        raise AssertionError("track URL should be rejected before fetching metadata")

    monkeypatch.setattr(songs_router, "urlopen", fail_if_called)

    resp = client_a.post(
        "/songs/import/playlist",
        json={"url": "https://open.spotify.com/track/abc123"},
    )

    assert resp.status_code == 400
    assert "playlist link" in resp.json()["detail"]


def test_import_song_metadata_rejects_lookalike_hosts_without_fetching(client_a, monkeypatch):
    def fail_if_called(_request, _timeout):
        raise AssertionError("lookalike host should be rejected before fetching metadata")

    monkeypatch.setattr(songs_router, "urlopen", fail_if_called)

    for url in (
        "https://fakespotify.com/track/abc123",
        "https://evilyoutube.com/watch?v=abc123",
    ):
        resp = client_a.post("/songs/import/metadata", json={"url": url})
        assert resp.status_code == 400
        assert "Link not recognized" in resp.json()["detail"]


def test_import_song_metadata_rejects_userinfo_host_bypass(client_a, monkeypatch):
    def fail_if_called(_request, _timeout):
        raise AssertionError("userinfo URL should be rejected before fetching metadata")

    monkeypatch.setattr(songs_router, "urlopen", fail_if_called)

    resp = client_a.post(
        "/songs/import/metadata",
        json={"url": "https://open.spotify.com@169.254.169.254/track/abc123"},
    )

    assert resp.status_code == 400
    assert "Link not recognized" in resp.json()["detail"]


def test_import_song_metadata_rejects_redirects(client_a, monkeypatch):
    def redirect_urlopen(_request, timeout):
        del timeout
        raise HTTPError(
            "https://open.spotify.com/oembed",
            302,
            "Found",
            hdrs={"Location": "http://169.254.169.254/latest/meta-data"},
            fp=None,
        )

    monkeypatch.setattr(songs_router, "urlopen", redirect_urlopen)

    resp = client_a.post(
        "/songs/import/metadata",
        json={"url": "https://open.spotify.com/track/abc123"},
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Could not fetch song metadata"


def test_import_song_metadata_reports_fetch_failures(client_a, monkeypatch):
    def fail_urlopen(_request, timeout):
        del timeout
        raise TimeoutError("timeout")

    monkeypatch.setattr(songs_router, "urlopen", fail_urlopen)

    resp = client_a.post(
        "/songs/import/metadata",
        json={"url": "https://youtu.be/abc123"},
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Could not fetch song metadata"

import base64
import binascii
import json
import re
import time
from html import unescape
from threading import Lock
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlencode, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.auth import get_current_user, get_optional_current_user
from app.core.redis import publish
from app.core.spotify import get_fresh_user_spotify_access_token
from app.models.user import User
from app.models.jam import Jam, JamAdmin, JamHardware, JamParticipant
from app.models.song import Song, Role
from app.schemas.song import (
    RoleOut,
    SongCreate,
    SongImportOut,
    SongImportRequest,
    SongImportTrackOut,
    SongPlaylistImportOut,
    SongUpdate,
    SongOut,
)

router = APIRouter(prefix="/songs", tags=["songs"])

DEFAULT_OPEN_ROLES = ("Vocals",)
OEMBED_TIMEOUT_SECONDS = 8
SPOTIFY_API_TIMEOUT_SECONDS = 8
SPOTIFY_API_PAGE_SIZE = 50
SPOTIFY_TOKEN_REFRESH_SKEW_SECONDS = 60
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_TRACK_URL = "https://api.spotify.com/v1/tracks/{track_id}"
SPOTIFY_PLAYLIST_ITEMS_URL = "https://api.spotify.com/v1/playlists/{playlist_id}/items"
VALID_SONG_STATUSES = {"pending", "approved"}
MAX_PLAYLIST_IMPORT_SONGS = 100


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


urlopen = build_opener(_NoRedirectHandler).open

_spotify_token_lock = Lock()
_spotify_access_token: str | None = None
_spotify_access_token_expires_at = 0.0


def _metadata_request_headers(url: str) -> dict[str, str]:
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; myJam/1.0)",
        "Accept-Language": "en-US,en;q=0.9",
    }
    host = (urlparse(url).hostname or "").lower()
    if _host_matches_domain(host, "youtube.com") or _host_matches_domain(host, "youtube-nocookie.com"):
        # Prevent regional consent redirects from replacing public playlist pages.
        headers["Cookie"] = "CONSENT=YES+cb; SOCS=CAI"
    return headers


def _song_out(song: Song) -> SongOut:
    return SongOut(
        id=song.id,
        jam_id=song.jam_id,
        title=song.title,
        artist=song.artist,
        status=song.status,
        submitted_by=song.submitted_by,
        submitted_by_name=song.submitter.name if song.submitter else "",
        created_at=song.created_at,
    )


def _role_out(role: Role) -> RoleOut:
    return RoleOut(
        id=role.id,
        song_id=role.song_id,
        instrument=role.instrument,
        owner_id=role.owner_id,
        owner_name=role.owner.name if role.owner else None,
        joined_by=role.joined_by,
        joined_by_name=role.joined_user.name if role.joined_user else None,
        pending_user=role.pending_user,
        pending_user_name=role.pending.name if role.pending else None,
    )


def _is_participant(jam_id: UUID, user_id: str, db: Session) -> bool:
    return db.query(JamParticipant).filter(
        JamParticipant.jam_id == jam_id,
        JamParticipant.user_id == user_id,
    ).first() is not None


def _get_locked_jam(db: Session, jam_id: UUID) -> Jam | None:
    return db.query(Jam).filter(Jam.id == jam_id).with_for_update().first()


def _get_locked_role(db: Session, role_id: UUID) -> Role | None:
    return db.query(Role).filter(Role.id == role_id).with_for_update().first()


def _get_locked_song(db: Session, song_id: UUID) -> Song | None:
    return db.query(Song).filter(Song.id == song_id).with_for_update().first()


def _get_song(db: Session, song_id: UUID) -> Song | None:
    return db.query(Song).filter(Song.id == song_id).first()


def _get_locked_participant_row(db: Session, jam_id: UUID, user_id: str) -> JamParticipant | None:
    return db.query(JamParticipant).filter(
        JamParticipant.jam_id == jam_id,
        JamParticipant.user_id == user_id,
    ).with_for_update().first()


def _require_locked_admin_row(db: Session, jam_id: UUID, user_id: str) -> JamAdmin:
    row = db.query(JamAdmin).filter(
        JamAdmin.jam_id == jam_id,
        JamAdmin.user_id == user_id,
    ).with_for_update().first()
    if not row:
        raise HTTPException(status_code=403, detail="Admin only")
    return row


def _get_locked_role_context(db: Session, role_id: UUID) -> tuple[Jam, Song, Role]:
    context = db.query(Role.song_id, Song.jam_id).join(Song, Role.song_id == Song.id).filter(
        Role.id == role_id,
    ).first()
    if not context:
        raise HTTPException(status_code=404, detail="Role not found")

    # Jam-scoped mutations lock the Jam first. This keeps lock ordering aligned
    # with hardware/song endpoints and avoids Song->Jam vs Jam->Song deadlocks.
    jam = _get_locked_jam(db, context.jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")

    song = _get_song(db, context.song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    role = _get_locked_role(db, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.song_id != song.id:
        raise HTTPException(status_code=409, detail="Role changed while processing request")

    return jam, song, role


def _ensure_default_roles(db: Session, song: Song) -> bool:
    created = False
    for instrument in DEFAULT_OPEN_ROLES:
        existing = db.query(Role).filter(
            Role.song_id == song.id,
            Role.instrument == instrument,
            Role.owner_id.is_(None),
        ).with_for_update().first()
        if existing:
            continue
        db.add(Role(song_id=song.id, instrument=instrument, owner_id=None))
        created = True
    if created:
        db.flush()
    return created


def _normalize_required_text(value: str, field_name: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    return normalized


def _normalize_song_status(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in VALID_SONG_STATUSES:
        raise HTTPException(status_code=400, detail="Song status is invalid")
    return normalized


def _fetch_json(url: str) -> dict:
    request = Request(url, headers=_metadata_request_headers(url))
    try:
        with urlopen(request, timeout=OEMBED_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Could not fetch song metadata") from exc


def _fetch_text(url: str) -> str | None:
    request = Request(url, headers=_metadata_request_headers(url))
    try:
        with urlopen(request, timeout=OEMBED_TIMEOUT_SECONDS) as response:
            return response.read().decode("utf-8", errors="ignore")
    except (HTTPError, URLError, TimeoutError):
        return None


def _extract_meta_content(html: str, property_name: str) -> str | None:
    for tag in re.findall(r"<meta\b[^>]*>", html, flags=re.IGNORECASE):
        attrs = {}
        for name, quoted, unquoted in re.findall(
            r"([A-Za-z_:.-]+)\s*=\s*(?:['\"]([^'\"]*)['\"]|([^\s\"'>/]+))",
            tag,
            flags=re.IGNORECASE,
        ):
            attrs[name.lower()] = unescape(quoted or unquoted).strip()

        marker = (attrs.get("property") or attrs.get("name") or "").lower()
        if marker == property_name.lower() and attrs.get("content"):
            return attrs["content"]
    return None


def _clean_spotify_artist(value: str) -> str:
    artist = re.sub(r"\s*\|\s*Spotify\s*$", "", value, flags=re.IGNORECASE).strip()
    artist = re.sub(r"\s*on Spotify\s*$", "", artist, flags=re.IGNORECASE).strip()
    return artist


def _extract_spotify_artist_from_html(html: str, title: str) -> str | None:
    candidates = [
        _extract_meta_content(html, "og:title"),
        _extract_meta_content(html, "twitter:title"),
    ]
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    if title_match:
        candidates.append(unescape(title_match.group(1)).strip())

    escaped_title = re.escape(title)
    patterns = [
        rf"^{escaped_title}\s+-\s+song and lyrics by\s+(.+?)(?:\s+\|\s+Spotify)?$",
        rf"^{escaped_title}\s+by\s+(.+?)(?:\s+\|\s+Spotify)?$",
        rf"^{escaped_title}\s+-\s+(.+?)(?:\s+\|\s+Spotify)?$",
    ]
    for candidate in filter(None, candidates):
        for pattern in patterns:
            match = re.search(pattern, candidate, flags=re.IGNORECASE)
            if match:
                return _clean_spotify_artist(match.group(1))

    description = _extract_meta_content(html, "og:description")
    if description:
        # Spotify often formats this as "Artist · Song · ..."
        artist = description.split("·", 1)[0].strip()
        if artist:
            return _clean_spotify_artist(artist)

    return None


def _iter_json_script_payloads(html: str):
    for match in re.finditer(r"<script\b[^>]*>(.*?)</script>", html, flags=re.IGNORECASE | re.DOTALL):
        payload = unescape(match.group(1)).strip()
        if not payload:
            continue

        if payload.startswith("{") or payload.startswith("["):
            yield payload
            continue

        try:
            decoded = base64.b64decode(payload, validate=True).decode("utf-8").strip()
        except (binascii.Error, UnicodeDecodeError, ValueError):
            decoded = ""
        if decoded.startswith("{") or decoded.startswith("["):
            yield decoded
            continue

        for pattern in (
            r"ytInitialData\s*=\s*({.*?});\s*</script>",
            r"window\.__INITIAL_STATE__\s*=\s*({.*?});",
        ):
            script_match = re.search(pattern, match.group(0), flags=re.DOTALL)
            if script_match:
                yield script_match.group(1)


def _walk_json(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk_json(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_json(child)


def _text_from_runs(value) -> str:
    if isinstance(value, str):
        return value.strip()
    if not isinstance(value, dict):
        return ""
    if isinstance(value.get("simpleText"), str):
        return value["simpleText"].strip()
    runs = value.get("runs")
    if isinstance(runs, list):
        return "".join(
            run.get("text", "")
            for run in runs
            if isinstance(run, dict)
        ).strip()
    return ""


def _artist_names_from_value(value) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        names = []
        for item in value:
            if isinstance(item, str):
                names.append(item)
            elif isinstance(item, dict):
                name = _artist_names_from_value(item)
                if name:
                    names.append(name)
        return ", ".join(name.strip() for name in names if name and name.strip())
    if isinstance(value, dict):
        text = _text_from_runs(value)
        if text:
            return text
        for key in ("name", "title", "text"):
            if isinstance(value.get(key), str) and value[key].strip():
                return value[key].strip()
        profile = value.get("profile")
        if isinstance(profile, dict):
            name = _artist_names_from_value(profile)
            if name:
                return name
        for key in ("items", "data"):
            nested = value.get(key)
            if isinstance(nested, (dict, list)):
                name = _artist_names_from_value(nested)
                if name:
                    return name
    return ""


def _dedupe_playlist_tracks(tracks: list[SongImportTrackOut]) -> list[SongImportTrackOut]:
    seen = set()
    deduped = []
    for track in tracks:
        title = track.title.strip()
        artist = track.artist.strip()
        if not title or not artist:
            continue
        key = (title.casefold(), artist.casefold())
        if key in seen:
            continue
        seen.add(key)
        deduped.append(SongImportTrackOut(title=title, artist=artist))
        if len(deduped) >= MAX_PLAYLIST_IMPORT_SONGS:
            break
    return deduped


def _host_matches_domain(host: str, domain: str) -> bool:
    return host == domain or host.endswith(f".{domain}")


def _detect_song_service(url: str) -> tuple[str, str]:
    parsed = urlparse(url.strip())
    host = (parsed.hostname or "").lower()
    path = parsed.path
    if parsed.username or parsed.password:
        raise HTTPException(
            status_code=400,
            detail="Link not recognized. Use a Spotify track link or YouTube video link.",
        )

    if _host_matches_domain(host, "spotify.com") and re.match(r"^/track/[A-Za-z0-9]+", path):
        return "Spotify", url.strip()

    if host in {"youtu.be", "www.youtu.be"} and path.strip("/"):
        return "YouTube", url.strip()

    if _host_matches_domain(host, "youtube.com") or _host_matches_domain(host, "youtube-nocookie.com"):
        query = parse_qs(parsed.query)
        if path == "/watch" and query.get("v"):
            return "YouTube", url.strip()
        if re.match(r"^/(shorts|embed)/[^/]+", path):
            return "YouTube", url.strip()

    raise HTTPException(
        status_code=400,
        detail="Link not recognized. Use a Spotify track link or YouTube video link.",
    )


def _detect_playlist_service(url: str) -> tuple[str, str]:
    parsed = urlparse(url.strip())
    host = (parsed.hostname or "").lower()
    path = parsed.path
    query = parse_qs(parsed.query)
    if parsed.username or parsed.password:
        raise HTTPException(
            status_code=400,
            detail="Link not recognized. Use a Spotify or YouTube playlist link.",
        )

    if _host_matches_domain(host, "spotify.com") and re.match(r"^/playlist/[A-Za-z0-9]+", path):
        return "Spotify", url.strip()

    if _host_matches_domain(host, "youtube.com") or _host_matches_domain(host, "youtube-nocookie.com"):
        if path == "/playlist" and query.get("list"):
            return "YouTube", url.strip()
        if path == "/watch" and query.get("list"):
            return "YouTube", url.strip()

    raise HTTPException(
        status_code=400,
        detail="Link not recognized. Use a Spotify or YouTube playlist link.",
    )


def _spotify_credentials() -> tuple[str, str] | None:
    client_id = (settings.SPOTIFY_CLIENT_ID or "").strip()
    client_secret = (settings.SPOTIFY_CLIENT_SECRET or "").strip()
    if not client_id or not client_secret:
        return None
    return client_id, client_secret


def _get_spotify_access_token() -> str | None:
    credentials = _spotify_credentials()
    if credentials is None:
        return None

    global _spotify_access_token, _spotify_access_token_expires_at
    now = time.time()
    if _spotify_access_token and _spotify_access_token_expires_at > now:
        return _spotify_access_token

    with _spotify_token_lock:
        now = time.time()
        if _spotify_access_token and _spotify_access_token_expires_at > now:
            return _spotify_access_token

        client_id, client_secret = credentials
        basic_token = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii")
        request = Request(
            SPOTIFY_TOKEN_URL,
            data=urlencode({"grant_type": "client_credentials"}).encode("utf-8"),
            headers={
                "Authorization": f"Basic {basic_token}",
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "myJam/1.0",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=SPOTIFY_API_TIMEOUT_SECONDS) as response:
                payload = json.loads(response.read().decode("utf-8"))
            access_token = str(payload["access_token"]).strip()
            expires_in = int(payload.get("expires_in", 3600))
            if not access_token:
                raise ValueError("empty access token")
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Could not authenticate with Spotify API") from exc

        _spotify_access_token = access_token
        _spotify_access_token_expires_at = time.time() + max(expires_in - SPOTIFY_TOKEN_REFRESH_SKEW_SECONDS, 0)
        return access_token


def _spotify_playlist_id_from_url(url: str) -> str:
    parsed = urlparse(url.strip())
    match = re.match(r"^/playlist/([A-Za-z0-9]+)", parsed.path)
    if not match:
        raise HTTPException(status_code=400, detail="Link not recognized. Use a Spotify or YouTube playlist link.")
    return match.group(1)


def _spotify_track_id_from_url(url: str) -> str:
    parsed = urlparse(url.strip())
    match = re.match(r"^/track/([A-Za-z0-9]+)", parsed.path)
    if not match:
        raise HTTPException(status_code=400, detail="Link not recognized. Use a Spotify track link or YouTube video link.")
    return match.group(1)


def _spotify_market_query() -> dict[str, str]:
    market = (settings.SPOTIFY_MARKET or "").strip().upper()
    return {"market": market} if market else {}


def _spotify_track_api_url(track_id: str) -> str:
    query = _spotify_market_query()
    base_url = SPOTIFY_TRACK_URL.format(track_id=quote(track_id, safe=""))
    return f"{base_url}?{urlencode(query)}" if query else base_url


def _spotify_playlist_items_api_url(playlist_id: str, offset: int, limit: int) -> str:
    query = {
        "limit": str(limit),
        "offset": str(offset),
        "additional_types": "track",
        "fields": "items(track(type,name,artists(name))),next,total",
    }
    query.update(_spotify_market_query())
    return f"{SPOTIFY_PLAYLIST_ITEMS_URL.format(playlist_id=quote(playlist_id, safe=''))}?{urlencode(query)}"


def _fetch_spotify_api_json(url: str, token: str) -> tuple[dict | None, int | None]:
    request = Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "myJam/1.0",
        },
    )
    try:
        with urlopen(request, timeout=SPOTIFY_API_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8")), 200
    except HTTPError as exc:
        return None, exc.code
    except (URLError, TimeoutError, json.JSONDecodeError):
        return None, None


def _parse_spotify_api_playlist_items(data: dict) -> tuple[list[SongImportTrackOut], int, bool]:
    items = data.get("items")
    if not isinstance(items, list):
        return [], 0, False

    tracks = []
    for item in items:
        if not isinstance(item, dict):
            continue
        track = item.get("track")
        if not isinstance(track, dict):
            continue
        if track.get("type") not in {None, "track"}:
            continue
        title = str(track.get("name") or "").strip()
        artist = _artist_names_from_value(track.get("artists"))
        if title and artist:
            tracks.append(SongImportTrackOut(title=title, artist=artist))

    return tracks, len(items), bool(data.get("next"))


def _parse_spotify_api_track(data: dict) -> SongImportTrackOut | None:
    if data.get("type") not in {None, "track"}:
        return None
    title = str(data.get("name") or "").strip()
    artist = _artist_names_from_value(data.get("artists"))
    if not title or not artist:
        return None
    return SongImportTrackOut(title=title, artist=artist)


def _resolve_spotify_metadata_with_api(url: str) -> SongImportOut | None:
    token = _get_spotify_access_token()
    if not token:
        return None

    data, _status = _fetch_spotify_api_json(
        _spotify_track_api_url(_spotify_track_id_from_url(url)),
        token,
    )
    if data is None:
        return None
    track = _parse_spotify_api_track(data)
    if not track:
        return None
    return SongImportOut(
        title=track.title,
        artist=track.artist,
        service="Spotify",
        original_url=url,
    )


def _resolve_spotify_playlist_with_api(
    url: str, token: str | None = None,
) -> tuple[list[SongImportTrackOut] | None, int | None]:
    token = token or _get_spotify_access_token()
    if not token:
        return None, None

    playlist_id = _spotify_playlist_id_from_url(url)
    tracks: list[SongImportTrackOut] = []
    offset = 0
    has_next = True
    first_status: int | None = None

    while has_next and len(tracks) < MAX_PLAYLIST_IMPORT_SONGS:
        limit = min(SPOTIFY_API_PAGE_SIZE, MAX_PLAYLIST_IMPORT_SONGS - len(tracks))
        data, status = _fetch_spotify_api_json(
            _spotify_playlist_items_api_url(playlist_id, offset, limit),
            token,
        )
        if first_status is None:
            first_status = status
        if data is None:
            break

        page_tracks, item_count, has_next = _parse_spotify_api_playlist_items(data)
        tracks.extend(page_tracks)
        if item_count == 0:
            break
        offset += item_count

    return (_dedupe_playlist_tracks(tracks) if tracks else None), first_status


def _parse_spotify_playlist_html(html: str) -> list[SongImportTrackOut]:
    tracks = []
    for payload in _iter_json_script_payloads(html):
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            continue
        for item in _walk_json(data):
            item_type = str(item.get("type") or item.get("__typename") or item.get("itemType") or "").lower()
            uri = str(item.get("uri") or "").lower()
            if item_type not in {"track", "song"} and not uri.startswith("spotify:track:"):
                continue

            title = str(item.get("title") or item.get("name") or "").strip()
            artist = _artist_names_from_value(
                item.get("artists")
                or item.get("artist")
                or item.get("subtitle")
                or item.get("ownerName")
            )
            if title and artist:
                tracks.append(SongImportTrackOut(title=title, artist=artist))
    return _dedupe_playlist_tracks(tracks)


def _parse_youtube_playlist_html(html: str) -> list[SongImportTrackOut]:
    tracks = []
    for payload in _iter_json_script_payloads(html):
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            continue
        for item in _walk_json(data):
            renderer = item.get("playlistVideoRenderer") if isinstance(item, dict) else None
            if not isinstance(renderer, dict):
                continue
            title = _text_from_runs(renderer.get("title"))
            artist = (
                _text_from_runs(renderer.get("shortBylineText"))
                or _text_from_runs(renderer.get("longBylineText"))
                or "YouTube"
            )
            if title and title.lower() not in {"deleted video", "private video"}:
                tracks.append(SongImportTrackOut(title=title, artist=artist))
    return _dedupe_playlist_tracks(tracks)


def _resolve_spotify_metadata(url: str) -> SongImportOut:
    api_song = _resolve_spotify_metadata_with_api(url)
    if api_song:
        return api_song

    oembed = _fetch_json(f"https://open.spotify.com/oembed?url={quote(url, safe='')}")
    title = (oembed.get("title") or "").strip()
    artist = (oembed.get("author_name") or "").strip()

    if not title:
        raise HTTPException(status_code=400, detail="Could not read Spotify song title")

    if not artist:
        html = _fetch_text(url)
        if html:
            artist = _extract_spotify_artist_from_html(html, title) or ""

    return SongImportOut(
        title=title,
        artist=artist or "Spotify",
        service="Spotify",
        original_url=url,
    )


def _resolve_youtube_metadata(url: str) -> SongImportOut:
    oembed = _fetch_json(f"https://www.youtube.com/oembed?url={quote(url, safe='')}&format=json")
    title = (oembed.get("title") or "").strip()
    artist = (oembed.get("author_name") or "").strip()

    if not title:
        raise HTTPException(status_code=400, detail="Could not read YouTube video title")

    return SongImportOut(
        title=title,
        artist=artist or "YouTube",
        service="YouTube",
        original_url=url,
    )


def _resolve_spotify_playlist(
    url: str,
    db: Session | None = None,
    current_user: User | None = None,
) -> SongPlaylistImportOut:
    user_token: str | None = None
    if db is not None and current_user is not None:
        user_token = get_fresh_user_spotify_access_token(db, current_user.id)
        if user_token:
            api_songs, _user_status = _resolve_spotify_playlist_with_api(url, token=user_token)
            if api_songs:
                return SongPlaylistImportOut(service="Spotify", original_url=url, songs=api_songs)

    api_songs, app_status = _resolve_spotify_playlist_with_api(url)
    if api_songs:
        return SongPlaylistImportOut(service="Spotify", original_url=url, songs=api_songs)

    # Spotify returns 404 both for private playlists and deleted/invalid ones.
    # If we have no user token yet, offering to connect Spotify is the most
    # useful next step — the UI softens the copy to cover the "wrong link" case.
    if app_status == 404 and user_token is None:
        is_authenticated = current_user is not None
        raise HTTPException(
            status_code=409,
            detail={
                "code": "spotify_auth_required",
                "authenticated": is_authenticated,
                "message": (
                    "We couldn't read this Spotify playlist. If it's private, "
                    + ("connect your Spotify account" if is_authenticated else "sign in and connect Spotify")
                    + " and try again. Otherwise, double-check the link."
                ),
            },
        )

    html = _fetch_text(url)
    if not html:
        raise HTTPException(status_code=400, detail="Could not fetch playlist metadata")
    songs = _parse_spotify_playlist_html(html)
    if not songs:
        raise HTTPException(status_code=400, detail="Could not read songs from Spotify playlist")
    return SongPlaylistImportOut(service="Spotify", original_url=url, songs=songs)


def _resolve_youtube_playlist(url: str) -> SongPlaylistImportOut:
    html = _fetch_text(url)
    if not html:
        raise HTTPException(status_code=400, detail="Could not fetch playlist metadata")
    songs = _parse_youtube_playlist_html(html)
    if not songs:
        raise HTTPException(status_code=400, detail="Could not read songs from YouTube playlist")
    return SongPlaylistImportOut(service="YouTube", original_url=url, songs=songs)


def _require_song_access(jam: Jam, current_user: User | None, db: Session) -> None:
    if jam.visibility == "public":
        return
    if current_user and _is_participant(jam.id, current_user.id, db):
        return
    if current_user and any(a.user_id == current_user.id for a in jam.admins):
        return
    raise HTTPException(status_code=403, detail="Access denied")


# ── Songs for a jam ───────────────────────────────────────────────────────────

@router.get("/jam/{jam_id}", response_model=list[SongOut])
def list_songs(
    jam_id: UUID,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    jam = db.query(Jam).filter(Jam.id == jam_id).first()
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    _require_song_access(jam, current_user, db)

    songs = db.query(Song).filter(Song.jam_id == jam_id).all()
    return [_song_out(s) for s in songs]


@router.post("/import/metadata", response_model=SongImportOut)
def import_song_metadata(body: SongImportRequest):
    service, normalized_url = _detect_song_service(body.url)
    if service == "Spotify":
        return _resolve_spotify_metadata(normalized_url)
    return _resolve_youtube_metadata(normalized_url)


@router.post("/import/playlist", response_model=SongPlaylistImportOut)
def import_playlist_metadata(
    body: SongImportRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    service, normalized_url = _detect_playlist_service(body.url)
    if service == "Spotify":
        return _resolve_spotify_playlist(normalized_url, db=db, current_user=current_user)
    return _resolve_youtube_playlist(normalized_url)


@router.post("/jam/{jam_id}", response_model=SongOut, status_code=status.HTTP_201_CREATED)
async def submit_song(
    jam_id: UUID,
    body: SongCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = _get_locked_jam(db, jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")

    if not _get_locked_participant_row(db, jam_id, current_user.id):
        raise HTTPException(status_code=403, detail="Must be a participant to submit songs")

    song_status = "pending" if jam.require_song_approval else "approved"
    song = Song(jam_id=jam_id, title=_normalize_required_text(body.title, "Song title"), artist=body.artist.strip(),
                status=song_status, submitted_by=current_user.id)
    db.add(song)
    db.flush()
    _ensure_default_roles(db, song)

    # Auto-create roles from approved hardware
    approved_hw = db.query(JamHardware).filter(
        JamHardware.jam_id == jam_id,
        JamHardware.status == "approved",
    ).all()
    for hw in approved_hw:
        db.add(Role(song_id=song.id, instrument=hw.instrument, owner_id=hw.owner_id))

    db.commit()
    db.refresh(song)
    await publish(f"jam:{jam_id}", json.dumps({"type": "song_added", "song_id": str(song.id)}))
    return _song_out(song)


# ── Single song ───────────────────────────────────────────────────────────────

@router.patch("/{song_id}", response_model=SongOut)
async def update_song(
    song_id: UUID,
    body: SongUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    song_ref = _get_song(db, song_id)
    if not song_ref:
        raise HTTPException(status_code=404, detail="Song not found")

    jam = _get_locked_jam(db, song_ref.jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    song = _get_locked_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    if song.jam_id != jam.id:
        raise HTTPException(status_code=409, detail="Song changed while processing request")
    is_admin = db.query(JamAdmin).filter(
        JamAdmin.jam_id == jam.id,
        JamAdmin.user_id == current_user.id,
    ).with_for_update().first() is not None
    if not is_admin and song.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    if body.title is not None:
        song.title = _normalize_required_text(body.title, "Song title")
    if body.artist is not None:
        song.artist = body.artist.strip()
    if body.status is not None:
        if not is_admin:
            raise HTTPException(status_code=403, detail="Admin only")
        song.status = _normalize_song_status(body.status)
        if song.status != "approved" and jam.current_song_id == song.id:
            jam.current_song_id = None
    jam_id = song.jam_id
    db.commit()
    db.refresh(song)
    await publish(f"jam:{jam_id}", json.dumps({"type": "song_updated", "song_id": str(song.id)}))
    return _song_out(song)


@router.delete("/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_song(
    song_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    song_ref = _get_song(db, song_id)
    if not song_ref:
        raise HTTPException(status_code=404, detail="Song not found")

    jam = _get_locked_jam(db, song_ref.jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    song = _get_locked_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    if song.jam_id != jam.id:
        raise HTTPException(status_code=409, detail="Song changed while processing request")
    is_admin = db.query(JamAdmin).filter(
        JamAdmin.jam_id == jam.id,
        JamAdmin.user_id == current_user.id,
    ).with_for_update().first() is not None
    if not is_admin and song.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    jam_id = song.jam_id
    cleared_current_song = jam.current_song_id == song.id
    if cleared_current_song:
        jam.current_song_id = None
    db.delete(song)
    db.commit()
    await publish(f"jam:{jam_id}", json.dumps({"type": "song_deleted", "song_id": str(song_id)}))
    if cleared_current_song:
        await publish(f"jam:{jam_id}", json.dumps({"type": "jam_updated", "jam": str(jam_id)}))


# ── Roles ─────────────────────────────────────────────────────────────────────

@router.get("/{song_id}/roles", response_model=list[RoleOut])
def list_roles(
    song_id: UUID,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    song = _get_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    jam = db.query(Jam).filter(Jam.id == song.jam_id).first()
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    _require_song_access(jam, current_user, db)

    missing_default = any(
        db.query(Role.id).filter(
            Role.song_id == song.id,
            Role.instrument == instrument,
            Role.owner_id.is_(None),
        ).first() is None
        for instrument in DEFAULT_OPEN_ROLES
    )
    if missing_default:
        locked_jam = _get_locked_jam(db, jam.id)
        if not locked_jam:
            raise HTTPException(status_code=404, detail="Jam not found")
        created_defaults = _ensure_default_roles(db, song)
        if created_defaults:
            db.commit()

    roles = db.query(Role).filter(Role.song_id == song_id).all()
    return [_role_out(r) for r in roles]


@router.post("/roles/{role_id}/claim", response_model=RoleOut)
async def claim_role(
    role_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam, _song, role = _get_locked_role_context(db, role_id)
    if role.joined_by:
        if role.joined_by == current_user.id:
            return _role_out(role)
        raise HTTPException(status_code=409, detail="Role already taken")
    if role.pending_user:
        if role.pending_user == current_user.id:
            return _role_out(role)
        raise HTTPException(status_code=409, detail="Role already pending")
    if not _get_locked_participant_row(db, jam.id, current_user.id):
        raise HTTPException(status_code=403, detail="Must be a participant to claim roles")

    if jam.require_role_approval:
        role.pending_user = current_user.id
    else:
        role.joined_by = current_user.id

    db.commit()
    db.refresh(role)
    await publish(f"jam:{jam.id}", json.dumps({"type": "role_updated", "role_id": str(role_id)}))
    return _role_out(role)


@router.post("/roles/{role_id}/leave", response_model=RoleOut)
async def leave_role(
    role_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam, _song, role = _get_locked_role_context(db, role_id)

    if role.joined_by == current_user.id:
        role.joined_by = None
    elif role.pending_user == current_user.id:
        role.pending_user = None
    elif role.joined_by is None and role.pending_user is None:
        return _role_out(role)
    else:
        raise HTTPException(status_code=403, detail="You are not in this role")

    db.commit()
    db.refresh(role)
    await publish(f"jam:{jam.id}", json.dumps({"type": "role_updated", "role_id": str(role_id)}))
    return _role_out(role)


@router.patch("/roles/{role_id}/approve", response_model=RoleOut)
async def approve_role(
    role_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam, _song, role = _get_locked_role_context(db, role_id)
    _require_locked_admin_row(db, jam.id, current_user.id)

    if role.pending_user is None:
        if role.joined_by is not None:
            return _role_out(role)
        raise HTTPException(status_code=409, detail="No pending role claim")

    role.joined_by = role.pending_user
    role.pending_user = None
    db.commit()
    db.refresh(role)
    await publish(f"jam:{jam.id}", json.dumps({"type": "role_updated", "role_id": str(role_id)}))
    return _role_out(role)


@router.patch("/roles/{role_id}/reject", response_model=RoleOut)
async def reject_role(
    role_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam, _song, role = _get_locked_role_context(db, role_id)
    _require_locked_admin_row(db, jam.id, current_user.id)

    if role.pending_user is None:
        if role.joined_by is None:
            return _role_out(role)
        raise HTTPException(status_code=409, detail="Role was already approved")

    role.pending_user = None
    db.commit()
    db.refresh(role)
    await publish(f"jam:{jam.id}", json.dumps({"type": "role_updated", "role_id": str(role_id)}))
    return _role_out(role)

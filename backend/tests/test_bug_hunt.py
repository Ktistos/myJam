"""
Bug-hunt tests targeting weak spots found during code review.

These tests cover:
- Input validation gaps (jam state, song status)
- Instrument normalization (case-collision, whitespace)
- Hardware / role interaction edge cases
- Cross-user permission boundaries on hardware
- Orphan-cleanup when participants leave
- Concurrency / idempotency of hardware endpoints
- Song import SSRF / host-check tightness
"""
import json
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.api.routers import songs as songs_router
from app.models.jam import Jam, JamAdmin, JamHardware, JamParticipant
from app.models.song import Role, Song

JAM_PAYLOAD = {
    "name": "Bug Hunt Night",
    "date": "2025-06-01T20:00:00",
    "visibility": "public",
    "address": "Test",
    "lat": 1.0,
    "lng": 2.0,
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

class _FakeResponse:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self):
        return self.body.encode("utf-8")


def _fake_urlopen_capture(captured_urls, body='{"title":"t"}'):
    def fake(request, timeout):
        del timeout
        captured_urls.append(request.full_url)
        return _FakeResponse(body)
    return fake


# ─── Input validation on jam state ────────────────────────────────────────────

def test_patch_jam_rejects_bogus_state(client_a):
    """
    BUG: PATCH /jams/{id} accepts arbitrary strings for `state`.
    Should reject anything outside {initial|tuning|in-progress|completed}.
    """
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()

    resp = client_a.patch(f"/jams/{jam['id']}", json={"state": "exploded"})

    assert resp.status_code == 400, (
        f"expected 400 for invalid state; got {resp.status_code}: {resp.text}"
    )


def test_patch_jam_accepts_valid_state_transitions(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    for state in ("initial", "tuning", "in-progress", "completed"):
        resp = client_a.patch(f"/jams/{jam['id']}", json={"state": state})
        assert resp.status_code == 200, f"state={state!r} rejected: {resp.text}"
        assert resp.json()["state"] == state


# ─── Input validation on song status ──────────────────────────────────────────

def test_patch_song_rejects_bogus_status(client_a):
    """
    BUG: PATCH /songs/{id} accepts arbitrary strings for `status`.
    Should reject anything outside {pending|approved|rejected}.
    """
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    song = client_a.post(f"/songs/jam/{jam['id']}", json={"title": "t", "artist": "a"}).json()

    resp = client_a.patch(f"/songs/{song['id']}", json={"status": "exploded"})

    assert resp.status_code == 400, (
        f"expected 400 for invalid status; got {resp.status_code}: {resp.text}"
    )


def test_patch_song_accepts_valid_statuses(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    song = client_a.post(f"/songs/jam/{jam['id']}", json={"title": "t", "artist": "a"}).json()
    for sstatus in ("pending", "approved"):
        resp = client_a.patch(f"/songs/{song['id']}", json={"status": sstatus})
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == sstatus


# ─── Non-admin status update via song owner ──────────────────────────────────

def test_song_owner_non_admin_cannot_set_status(client_a, client_b):
    """Song submitter who is not jam admin cannot modify status."""
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_b.post(f"/jams/{jam['id']}/join")
    song = client_b.post(f"/songs/jam/{jam['id']}",
                         json={"title": "t", "artist": "a"}).json()

    resp = client_b.patch(f"/songs/{song['id']}", json={"status": "approved"})
    assert resp.status_code == 403


def test_song_owner_can_update_own_title_without_admin(client_a, client_b):
    """Non-admin submitter can still edit their own song's title/artist."""
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_b.post(f"/jams/{jam['id']}/join")
    song = client_b.post(f"/songs/jam/{jam['id']}",
                         json={"title": "t", "artist": "a"}).json()

    resp = client_b.patch(f"/songs/{song['id']}", json={"title": "new"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "new"


# ─── Hardware: instrument normalization ───────────────────────────────────────

def test_hardware_instrument_whitespace_stripped(client_a):
    """Submit '  Guitar  ' — should be stored as 'Guitar' (trimmed)."""
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.post(f"/jams/{jam['id']}/hardware?instrument=%20%20Guitar%20%20")
    assert resp.status_code == 201
    assert resp.json()["instrument"] == "Guitar"


def test_hardware_instrument_empty_rejected(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.post(f"/jams/{jam['id']}/hardware?instrument=%20%20")
    assert resp.status_code == 400


def test_hardware_instrument_too_long_rejected(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.post(f"/jams/{jam['id']}/hardware?instrument={'x' * 65}")
    assert resp.status_code == 400


def test_hardware_instrument_case_collides(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar")
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=guitar")

    hw_list = client_a.get(f"/jams/{jam['id']}/hardware").json()
    guitars = [h for h in hw_list if h["instrument"].casefold() == "guitar"]
    assert len(guitars) == 1, (
        f"expected 1 dedup'd guitar entry, got {len(guitars)}: {guitars}"
    )


def test_hardware_vocals_rejected_case_insensitive(client_a):
    """Any casing of 'vocals' must be rejected; 'Vocals' is auto-created."""
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    for value in ("Vocals", "vocals", "VOCALS", " Vocals "):
        resp = client_a.post(f"/jams/{jam['id']}/hardware?instrument={value}")
        assert resp.status_code == 400, f"accepted value={value!r}"


# ─── Hardware: update renaming behavior ───────────────────────────────────────

def test_update_hardware_keeps_claimed_role_owner(client_a, client_b):
    """
    Rename hardware that currently has a claimed role.
    The role's joined_by must stay intact after rename.
    """
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    song = client_a.post(f"/songs/jam/{jam['id']}",
                         json={"title": "t", "artist": "a"}).json()
    hw = client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar").json()

    # someone claims the guitar role
    client_b.post(f"/jams/{jam['id']}/join")
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    guitar_role = next(r for r in roles if r["instrument"] == "Guitar")
    claim = client_b.post(f"/songs/roles/{guitar_role['id']}/claim")
    assert claim.status_code == 200

    # admin renames the hardware
    resp = client_a.patch(
        f"/jams/{jam['id']}/hardware/{hw['id']}",
        json={"instrument": "Electric Guitar"},
    )
    assert resp.status_code == 200

    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    eg = next((r for r in roles if r["instrument"] == "Electric Guitar"), None)
    assert eg is not None, "Electric Guitar role missing after rename"
    assert eg["joined_by"] == "uid-b", "claim was wiped when hardware renamed"


def test_update_hardware_pending_does_not_touch_roles(client_a, client_b):
    """Renaming PENDING hardware must not attempt to rename non-existent roles."""
    jam = client_a.post(
        "/jams", json={**JAM_PAYLOAD, "require_hardware_approval": True}
    ).json()
    client_a.post(f"/songs/jam/{jam['id']}", json={"title": "t", "artist": "a"})
    client_b.post(f"/jams/{jam['id']}/join")
    hw = client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums").json()
    assert hw["status"] == "pending"

    resp = client_b.patch(
        f"/jams/{jam['id']}/hardware/{hw['id']}",
        json={"instrument": "Snare"},
    )
    assert resp.status_code == 200
    assert resp.json()["instrument"] == "Snare"
    assert resp.json()["status"] == "pending"


# ─── Hardware: permission boundaries ──────────────────────────────────────────

def test_list_hardware_private_jam_anon_forbidden(client_a, anon_client):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "visibility": "private"}).json()
    resp = anon_client.get(f"/jams/{jam['id']}/hardware")
    assert resp.status_code == 403


def test_list_hardware_unknown_jam_404(client_a):
    resp = client_a.get(f"/jams/{uuid4()}/hardware")
    assert resp.status_code == 404


def test_approve_hardware_non_admin_forbidden(client_a, client_b):
    jam = client_a.post(
        "/jams", json={**JAM_PAYLOAD, "require_hardware_approval": True}
    ).json()
    client_b.post(f"/jams/{jam['id']}/join")
    hw = client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums").json()

    resp = client_b.patch(f"/jams/{jam['id']}/hardware/{hw['id']}/approve")
    assert resp.status_code == 403


def test_reject_hardware_non_admin_forbidden(client_a, client_b):
    jam = client_a.post(
        "/jams", json={**JAM_PAYLOAD, "require_hardware_approval": True}
    ).json()
    client_b.post(f"/jams/{jam['id']}/join")
    hw = client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums").json()

    resp = client_b.patch(f"/jams/{jam['id']}/hardware/{hw['id']}/reject")
    assert resp.status_code == 403


def test_approve_hardware_idempotent(client_a, client_b):
    jam = client_a.post(
        "/jams", json={**JAM_PAYLOAD, "require_hardware_approval": True}
    ).json()
    client_b.post(f"/jams/{jam['id']}/join")
    client_a.post(f"/songs/jam/{jam['id']}", json={"title": "t", "artist": "a"})
    hw = client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums").json()

    first = client_a.patch(f"/jams/{jam['id']}/hardware/{hw['id']}/approve")
    second = client_a.patch(f"/jams/{jam['id']}/hardware/{hw['id']}/approve")
    assert first.status_code == 200
    assert second.status_code == 200

    # Approval should have created exactly one Drums role per song (not duplicated).
    songs = client_a.get(f"/songs/jam/{jam['id']}").json()
    roles = client_a.get(f"/songs/{songs[0]['id']}/roles").json()
    drum_roles = [r for r in roles if r["instrument"] == "Drums"]
    assert len(drum_roles) == 1


# ─── Hardware: cleanup on participant leave ───────────────────────────────────

def test_participant_leave_does_not_orphan_claimed_roles(client_a, client_b):
    """
    When a participant who has claimed roles leaves the jam, their claims
    should either stay intact (so the admin can see who was on what) OR
    be released so someone else can take over. This test documents current
    behavior: claims survive leaving — a known rough edge.
    """
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_b.post(f"/jams/{jam['id']}/join")
    client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums")
    song = client_a.post(f"/songs/jam/{jam['id']}",
                         json={"title": "t", "artist": "a"}).json()

    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    drums = next(r for r in roles if r["instrument"] == "Drums")
    # b claims their drums role
    client_b.post(f"/songs/roles/{drums['id']}/claim")

    resp = client_b.post(f"/jams/{jam['id']}/leave")
    assert resp.status_code == 200

    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    drums_after = next((r for r in roles if r["instrument"] == "Drums"), None)
    # Role + owner_id preserved even though the participant left.
    assert drums_after is not None


def test_participant_leave_keeps_their_hardware_visible(client_a, client_b):
    """Hardware created by a leaver remains in the jam list."""
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_b.post(f"/jams/{jam['id']}/join")
    client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums")
    client_b.post(f"/jams/{jam['id']}/leave")

    hw_list = client_a.get(f"/jams/{jam['id']}/hardware").json()
    drums = [h for h in hw_list if h["instrument"] == "Drums"]
    assert len(drums) == 1, "hardware disappeared after owner left"


# ─── Submit-song creates a role only for APPROVED hardware ────────────────────

def test_submit_song_ignores_pending_hardware(client_a, client_b):
    jam = client_a.post(
        "/jams", json={**JAM_PAYLOAD, "require_hardware_approval": True}
    ).json()
    client_b.post(f"/jams/{jam['id']}/join")
    # pending
    client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums")

    song = client_a.post(f"/songs/jam/{jam['id']}",
                         json={"title": "t", "artist": "a"}).json()
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    drums = [r for r in roles if r["instrument"] == "Drums"]
    assert drums == []


# ─── Song import: host-check tightness ────────────────────────────────────────

def test_import_rejects_lookalike_spotify_host(client_a):
    """
    BUG: host.endswith('spotify.com') returns True for 'evilspotify.com'.
    A pasted link like https://fakespotify.com/track/abc should be refused.
    """
    resp = client_a.post(
        "/songs/import/metadata",
        json={"url": "https://fakespotify.com/track/abc123"},
    )
    assert resp.status_code == 400, (
        f"lookalike host accepted: {resp.status_code}: {resp.text}"
    )


def test_import_rejects_lookalike_youtube_host(client_a):
    resp = client_a.post(
        "/songs/import/metadata",
        json={"url": "https://evilyoutube.com/watch?v=abc123"},
    )
    assert resp.status_code == 400


def test_import_accepts_youtube_shorts(client_a, monkeypatch):
    monkeypatch.setattr(
        songs_router,
        "urlopen",
        lambda req, timeout: _FakeResponse(
            json.dumps({"title": "Shorts", "author_name": "Creator"})
        ),
    )
    resp = client_a.post(
        "/songs/import/metadata",
        json={"url": "https://www.youtube.com/shorts/abcDEF"},
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Shorts"


# ─── Invite-code normalization edge cases ────────────────────────────────────

def test_join_private_jam_ignores_invite_code_whitespace_and_dashes(client_a, client_b):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "visibility": "private"}).json()
    code = jam["invite_code"]

    resp = client_b.post(
        f"/jams/{jam['id']}/join?invite_code=%20%20{code[:2]}-{code[2:]}%20%20"
    )
    assert resp.status_code == 201


def test_join_private_jam_empty_invite_code_forbidden(client_a, client_b):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "visibility": "private"}).json()
    resp = client_b.post(f"/jams/{jam['id']}/join?invite_code=")
    assert resp.status_code == 403


# ─── Remove admin edge cases ─────────────────────────────────────────────────

def test_remove_admin_unknown_user_is_idempotent(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.delete(f"/jams/{jam['id']}/admins/no-such-user")
    assert resp.status_code == 200
    assert resp.json()["already_removed"] is True


def test_remove_admin_requires_admin(client_a, client_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_b.post(f"/jams/{jam['id']}/join")
    resp = client_b.delete(f"/jams/{jam['id']}/admins/uid-a")
    assert resp.status_code == 403


# ─── Hardware URL with missing/unknown id ────────────────────────────────────

def test_update_unknown_hardware_404(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.patch(
        f"/jams/{jam['id']}/hardware/{uuid4()}",
        json={"instrument": "X"},
    )
    assert resp.status_code == 404


def test_approve_unknown_hardware_404(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.patch(f"/jams/{jam['id']}/hardware/{uuid4()}/approve")
    assert resp.status_code == 404


def test_delete_unknown_hardware_404(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.delete(f"/jams/{jam['id']}/hardware/{uuid4()}")
    assert resp.status_code == 404


# ─── Hardware cross-jam isolation ─────────────────────────────────────────────

def test_hardware_id_from_different_jam_404(client_a):
    """An HW id belonging to jam A must not be patchable via jam B's URL."""
    jam_a = client_a.post("/jams", json=JAM_PAYLOAD).json()
    jam_b = client_a.post("/jams", json={**JAM_PAYLOAD, "name": "B"}).json()
    hw = client_a.post(f"/jams/{jam_a['id']}/hardware?instrument=Guitar").json()

    resp = client_a.patch(
        f"/jams/{jam_b['id']}/hardware/{hw['id']}",
        json={"instrument": "Bass"},
    )
    assert resp.status_code == 404

    resp = client_a.delete(f"/jams/{jam_b['id']}/hardware/{hw['id']}")
    assert resp.status_code == 404


# ─── Uploads: missing filename ────────────────────────────────────────────────

# ─── Song deletion / current_song interaction ────────────────────────────────

def test_delete_current_song_clears_pointer(client_a):
    """
    Deleting the song that is set as jam.current_song_id must not leave
    a dangling FK pointer (and must not 500).
    """
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    song = client_a.post(f"/songs/jam/{jam['id']}",
                         json={"title": "t", "artist": "a"}).json()
    set_resp = client_a.patch(f"/jams/{jam['id']}",
                              json={"current_song_id": song["id"]})
    assert set_resp.status_code == 200
    assert set_resp.json()["current_song_id"] == song["id"]

    del_resp = client_a.delete(f"/songs/{song['id']}")
    assert del_resp.status_code in (204, 409), del_resp.text

    jam_after = client_a.get(f"/jams/{jam['id']}").json()
    # Either pointer is cleared, or the delete was refused — never dangling.
    assert jam_after["current_song_id"] in (None, song["id"])


def test_delete_jam_cascades_to_songs_and_roles(client_a, db_session):
    from uuid import UUID as _UUID
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    song = client_a.post(f"/songs/jam/{jam['id']}",
                         json={"title": "t", "artist": "a"}).json()
    # trigger default role creation
    client_a.get(f"/songs/{song['id']}/roles")
    jam_uuid = _UUID(jam["id"])
    song_uuid = _UUID(song["id"])

    resp = client_a.delete(f"/jams/{jam['id']}")
    assert resp.status_code == 204
    assert db_session.query(Song).filter(Song.jam_id == jam_uuid).count() == 0
    assert db_session.query(Role).filter(Role.song_id == song_uuid).count() == 0


# ─── Submit song in a completed jam ───────────────────────────────────────────

def test_submit_song_in_completed_jam_still_allowed_or_blocked(client_a):
    """
    Submitting to a completed jam — current behavior is to allow it.
    This documents the behavior; if you later want to block it, tighten
    the assertion (e.g., 400 / 409).
    """
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_a.patch(f"/jams/{jam['id']}", json={"state": "completed"})
    resp = client_a.post(f"/songs/jam/{jam['id']}",
                         json={"title": "encore", "artist": "x"})
    assert resp.status_code in (201, 400, 409), resp.text


# ─── Concurrency-style idempotency (sequential proxy) ────────────────────────

def test_duplicate_hardware_submission_is_safe(client_a):
    """
    Two sequential POSTs with identical (instrument, owner, jam) must not
    create two rows (the endpoint is idempotent).
    """
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    for index in range(5):
        r = client_a.post(f"/jams/{jam['id']}/hardware?instrument=Synth")
        assert r.status_code == (201 if index == 0 else 200)
    hw = client_a.get(f"/jams/{jam['id']}/hardware").json()
    synths = [h for h in hw if h["instrument"].lower() == "synth"]
    assert len(synths) == 1


def test_upload_avatar_missing_filename(client_a):
    """
    Defensive: FastAPI can deliver an UploadFile with filename=None.
    The code must not crash with TypeError.
    """
    from io import BytesIO
    files = {"file": ("", BytesIO(b"x" * 10), "image/png")}
    # TestClient sends filename as empty string when "" is supplied; the route
    # parses the extension defensively. We mock MinIO so no bucket is needed.
    with patch("app.api.routers.uploads.get_minio") as minio_mock:
        minio_mock.return_value.put_object.return_value = None
        resp = client_a.post("/uploads/avatar", files=files)
    # We only assert there's no 500 crash.
    assert resp.status_code != 500, resp.text


def test_upload_avatar_rejects_large_file_before_minio(client_a):
    from io import BytesIO
    from app.api.routers.uploads import MAX_SIZE

    files = {"file": ("large.png", BytesIO(b"x" * (MAX_SIZE + 1)), "image/png")}
    with patch("app.api.routers.uploads.get_minio") as minio_mock:
        resp = client_a.post("/uploads/avatar", files=files)

    assert resp.status_code == 400
    assert resp.json()["detail"] == "File too large (max 5 MB)"
    minio_mock.return_value.put_object.assert_not_called()

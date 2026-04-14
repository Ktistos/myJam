"""Tests for /songs endpoints (songs + roles)."""
import pytest
from sqlalchemy import text

JAM_PAYLOAD = {
    "name": "Rock Session",
    "date": "2025-07-01T19:00:00",
    "visibility": "public",
    "address": "Studio B",
    "lat": 37.78,
    "lng": -122.41,
}

SONG_PAYLOAD = {"title": "Whole Lotta Love", "artist": "Led Zeppelin"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _create_jam(client):
    return client.post("/jams", json=JAM_PAYLOAD).json()


def _submit_song(client, jam_id, payload=None):
    return client.post(f"/songs/jam/{jam_id}", json=payload or SONG_PAYLOAD)


def _role_by_instrument(roles, instrument):
    return next(role for role in roles if role["instrument"] == instrument)


# ── POST /songs/jam/{id} ─────────────────────────────────────────────────────

def test_submit_song_as_participant(client_a):
    jam = _create_jam(client_a)
    resp = _submit_song(client_a, jam["id"])
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == SONG_PAYLOAD["title"]
    assert data["status"] == "approved"  # no song approval required by default


def test_submit_song_pending_when_approval_required(client_a):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "require_song_approval": True}).json()
    resp = _submit_song(client_a, jam["id"])
    assert resp.status_code == 201
    assert resp.json()["status"] == "pending"


def test_submit_song_non_participant_forbidden(client_a, client_b):
    jam = _create_jam(client_a)
    resp = _submit_song(client_b, jam["id"])
    assert resp.status_code == 403


def test_submit_song_rejects_blank_title(client_a):
    jam = _create_jam(client_a)
    resp = _submit_song(client_a, jam["id"], {"title": "   ", "artist": "Jimi Hendrix"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Song title is required"


def test_submit_song_creates_roles_from_hardware(client_a):
    """Roles are auto-created from jam hardware when a song is submitted."""
    jam = _create_jam(client_a)
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar")
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Bass")

    song = _submit_song(client_a, jam["id"]).json()
    roles_resp = client_a.get(f"/songs/{song['id']}/roles")
    assert roles_resp.status_code == 200
    instruments = [r["instrument"] for r in roles_resp.json()]
    assert "Vocals" in instruments
    assert "Guitar" in instruments
    assert "Bass" in instruments


# ── GET /songs/jam/{id} ───────────────────────────────────────────────────────

def test_list_songs(client_a):
    jam = _create_jam(client_a)
    _submit_song(client_a, jam["id"])
    _submit_song(client_a, jam["id"], {"title": "Comfortably Numb", "artist": "Pink Floyd"})

    resp = client_a.get(f"/songs/jam/{jam['id']}")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_list_private_jam_songs_requires_membership(client_a, anon_client):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "visibility": "private"}).json()
    _submit_song(client_a, jam["id"])

    resp = anon_client.get(f"/songs/jam/{jam['id']}")
    assert resp.status_code == 403


# ── PATCH /songs/{id} ────────────────────────────────────────────────────────

def test_update_song_title(client_a):
    jam = _create_jam(client_a)
    song = _submit_song(client_a, jam["id"]).json()
    resp = client_a.patch(f"/songs/{song['id']}", json={"title": "Updated Title"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Title"


def test_update_song_status_admin_only(client_a, client_b):
    jam = _create_jam(client_a)
    client_b.post(f"/jams/{jam['id']}/join")
    song = _submit_song(client_b, jam["id"]).json()

    # non-admin cannot change status
    resp = client_b.patch(f"/songs/{song['id']}", json={"status": "approved"})
    assert resp.status_code == 403

    # admin can
    resp = client_a.patch(f"/songs/{song['id']}", json={"status": "approved"})
    assert resp.status_code == 200


def test_update_song_rejects_invalid_status(client_a):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "require_song_approval": True}).json()
    song = _submit_song(client_a, jam["id"]).json()
    resp = client_a.patch(f"/songs/{song['id']}", json={"status": "playing"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Song status is invalid"


def test_update_song_rejects_blank_title(client_a):
    jam = _create_jam(client_a)
    song = _submit_song(client_a, jam["id"]).json()
    resp = client_a.patch(f"/songs/{song['id']}", json={"title": ""})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Song title is required"


# ── DELETE /songs/{id} ───────────────────────────────────────────────────────

def test_delete_song_by_submitter(client_a):
    jam = _create_jam(client_a)
    song = _submit_song(client_a, jam["id"]).json()
    resp = client_a.delete(f"/songs/{song['id']}")
    assert resp.status_code == 204


def test_delete_current_song_clears_jam_current_song(client_a):
    jam = _create_jam(client_a)
    song = _submit_song(client_a, jam["id"]).json()
    set_resp = client_a.patch(f"/jams/{jam['id']}", json={"current_song_id": song["id"]})
    assert set_resp.status_code == 200

    delete_resp = client_a.delete(f"/songs/{song['id']}")

    assert delete_resp.status_code == 204
    jam_resp = client_a.get(f"/jams/{jam['id']}")
    assert jam_resp.status_code == 200
    assert jam_resp.json()["current_song_id"] is None


def test_delete_song_non_owner_non_admin_forbidden(client_a, client_b):
    jam = _create_jam(client_a)
    client_b.post(f"/jams/{jam['id']}/join")
    song_a = _submit_song(client_a, jam["id"]).json()
    resp = client_b.delete(f"/songs/{song_a['id']}")
    assert resp.status_code == 403


# ── GET /songs/{id}/roles ────────────────────────────────────────────────────

def test_list_roles_has_vocals_without_hardware(client_a):
    jam = _create_jam(client_a)
    song = _submit_song(client_a, jam["id"]).json()
    resp = client_a.get(f"/songs/{song['id']}/roles")
    assert resp.status_code == 200
    roles = resp.json()
    assert [role["instrument"] for role in roles] == ["Vocals"]
    assert roles[0]["owner_id"] is None


def test_list_roles_adds_vocals_to_existing_song_without_duplicate(client_a, db_session):
    jam = _create_jam(client_a)
    song = _submit_song(client_a, jam["id"]).json()
    db_session.execute(text("DELETE FROM roles WHERE song_id = :song_id"), {"song_id": song["id"]})
    db_session.commit()

    first = client_a.get(f"/songs/{song['id']}/roles")
    second = client_a.get(f"/songs/{song['id']}/roles")

    assert first.status_code == 200
    assert second.status_code == 200
    assert [role["instrument"] for role in second.json()] == ["Vocals"]


# ── POST /songs/roles/{id}/claim ────────────────────────────────────────────

def test_claim_role(client_a, client_b):
    jam = _create_jam(client_a)
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar")
    song = _submit_song(client_a, jam["id"]).json()
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    role_id = _role_by_instrument(roles, "Guitar")["id"]

    # user_b joins and claims
    client_b.post(f"/jams/{jam['id']}/join")
    resp = client_b.post(f"/songs/roles/{role_id}/claim")
    assert resp.status_code == 200
    assert resp.json()["joined_by"] == "uid-b"


def test_claim_role_requires_participation(client_a, client_b):
    jam = _create_jam(client_a)
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar")
    song = _submit_song(client_a, jam["id"]).json()
    roles = client_a.get(f"/songs/{song['id']}/roles").json()

    resp = client_b.post(f"/songs/roles/{_role_by_instrument(roles, 'Guitar')['id']}/claim")
    assert resp.status_code == 403


def test_claim_role_already_taken(client_a, client_b):
    jam = _create_jam(client_a)
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar")
    song = _submit_song(client_a, jam["id"]).json()
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    role_id = _role_by_instrument(roles, "Guitar")["id"]

    client_a.post(f"/songs/roles/{role_id}/claim")  # creator claims it first
    client_b.post(f"/jams/{jam['id']}/join")
    resp = client_b.post(f"/songs/roles/{role_id}/claim")
    assert resp.status_code == 409


def test_claim_role_same_user_repeat_is_idempotent(client_a, client_b):
    jam = _create_jam(client_a)
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar")
    song = _submit_song(client_a, jam["id"]).json()
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    role_id = _role_by_instrument(roles, "Guitar")["id"]

    client_b.post(f"/jams/{jam['id']}/join")

    first = client_b.post(f"/songs/roles/{role_id}/claim")
    second = client_b.post(f"/songs/roles/{role_id}/claim")

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["joined_by"] == "uid-b"


def test_claim_role_pending_when_approval_required(client_a, client_b):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "require_role_approval": True}).json()
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Drums")
    song = _submit_song(client_a, jam["id"]).json()
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    role_id = _role_by_instrument(roles, "Drums")["id"]

    client_b.post(f"/jams/{jam['id']}/join")
    resp = client_b.post(f"/songs/roles/{role_id}/claim")
    assert resp.status_code == 200
    data = resp.json()
    assert data["pending_user"] == "uid-b"
    assert data["joined_by"] is None


# ── POST /songs/roles/{id}/leave ─────────────────────────────────────────────

def test_leave_role(client_a, client_b):
    jam = _create_jam(client_a)
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Bass")
    song = _submit_song(client_a, jam["id"]).json()
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    role_id = _role_by_instrument(roles, "Bass")["id"]

    client_b.post(f"/jams/{jam['id']}/join")
    client_b.post(f"/songs/roles/{role_id}/claim")
    resp = client_b.post(f"/songs/roles/{role_id}/leave")
    assert resp.status_code == 200
    assert resp.json()["joined_by"] is None


def test_leave_role_not_in_it(client_a, client_b):
    jam = _create_jam(client_a)
    song = _submit_song(client_a, jam["id"]).json()
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    role_id = _role_by_instrument(roles, "Vocals")["id"]

    client_b.post(f"/jams/{jam['id']}/join")
    resp = client_b.post(f"/songs/roles/{role_id}/leave")  # hasn't claimed it
    assert resp.status_code == 200
    assert resp.json()["joined_by"] is None
    assert resp.json()["pending_user"] is None


def test_leave_role_conflict_when_other_user_owns_it(client_a, client_b):
    jam = _create_jam(client_a)
    song = _submit_song(client_a, jam["id"]).json()
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    role_id = _role_by_instrument(roles, "Vocals")["id"]

    client_a.post(f"/songs/roles/{role_id}/claim")
    client_b.post(f"/jams/{jam['id']}/join")
    resp = client_b.post(f"/songs/roles/{role_id}/leave")
    assert resp.status_code == 403


# ── PATCH /songs/roles/{id}/approve ─────────────────────────────────────────

def test_approve_role(client_a, client_b):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "require_role_approval": True}).json()
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Piano")
    song = _submit_song(client_a, jam["id"]).json()
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    role_id = _role_by_instrument(roles, "Piano")["id"]

    client_b.post(f"/jams/{jam['id']}/join")
    client_b.post(f"/songs/roles/{role_id}/claim")

    resp = client_a.patch(f"/songs/roles/{role_id}/approve")
    assert resp.status_code == 200
    data = resp.json()
    assert data["joined_by"] == "uid-b"
    assert data["pending_user"] is None


def test_approve_role_non_admin_forbidden(client_a, client_b):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "require_role_approval": True}).json()
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Sax")
    song = _submit_song(client_a, jam["id"]).json()
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    role_id = _role_by_instrument(roles, "Sax")["id"]

    client_b.post(f"/jams/{jam['id']}/join")
    client_b.post(f"/songs/roles/{role_id}/claim")

    resp = client_b.patch(f"/songs/roles/{role_id}/approve")
    assert resp.status_code == 403


def test_approve_role_already_approved_is_idempotent(client_a, client_b):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "require_role_approval": True}).json()
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Sax")
    song = _submit_song(client_a, jam["id"]).json()
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    role_id = _role_by_instrument(roles, "Sax")["id"]

    client_b.post(f"/jams/{jam['id']}/join")
    client_b.post(f"/songs/roles/{role_id}/claim")

    first = client_a.patch(f"/songs/roles/{role_id}/approve")
    second = client_a.patch(f"/songs/roles/{role_id}/approve")

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["joined_by"] == "uid-b"


# ── PATCH /songs/roles/{id}/reject ──────────────────────────────────────────

def test_reject_role(client_a, client_b):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "require_role_approval": True}).json()
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Trumpet")
    song = _submit_song(client_a, jam["id"]).json()
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    role_id = _role_by_instrument(roles, "Trumpet")["id"]

    client_b.post(f"/jams/{jam['id']}/join")
    client_b.post(f"/songs/roles/{role_id}/claim")

    resp = client_a.patch(f"/songs/roles/{role_id}/reject")
    assert resp.status_code == 200
    data = resp.json()
    assert data["pending_user"] is None
    assert data["joined_by"] is None


def test_reject_role_already_rejected_is_idempotent(client_a, client_b):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "require_role_approval": True}).json()
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Trumpet")
    song = _submit_song(client_a, jam["id"]).json()
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    role_id = _role_by_instrument(roles, "Trumpet")["id"]

    client_b.post(f"/jams/{jam['id']}/join")
    client_b.post(f"/songs/roles/{role_id}/claim")

    first = client_a.patch(f"/songs/roles/{role_id}/reject")
    second = client_a.patch(f"/songs/roles/{role_id}/reject")

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["pending_user"] is None
    assert second.json()["joined_by"] is None


def test_reject_role_after_approve_conflicts(client_a, client_b):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "require_role_approval": True}).json()
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Trumpet")
    song = _submit_song(client_a, jam["id"]).json()
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    role_id = _role_by_instrument(roles, "Trumpet")["id"]

    client_b.post(f"/jams/{jam['id']}/join")
    client_b.post(f"/songs/roles/{role_id}/claim")
    client_a.patch(f"/songs/roles/{role_id}/approve")

    resp = client_a.patch(f"/songs/roles/{role_id}/reject")
    assert resp.status_code == 409

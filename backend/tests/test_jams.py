"""Tests for /jams endpoints."""
import pytest
from unittest.mock import AsyncMock, patch
from uuid import UUID

from fastapi.testclient import TestClient

from app.core.auth import get_current_user
from app.core.database import get_db
from app.main import app
from app.models.jam import Jam, JamAdmin, JamParticipant
from app.models.user import User

# ── Helpers ───────────────────────────────────────────────────────────────────

JAM_PAYLOAD = {
    "name": "Blues Night",
    "date": "2025-06-01T20:00:00",
    "visibility": "public",
    "address": "The Rusty Nail",
    "lat": 37.77,
    "lng": -122.42,
}


# ── POST /jams ─────────────────────────────────────────────────────────────────

def test_create_jam(client_a, user_a):
    resp = client_a.post("/jams", json=JAM_PAYLOAD)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Blues Night"
    assert data["created_by"] == user_a.id
    assert user_a.id in data["admin_ids"]


def test_create_jam_private_gets_invite_code(client_a):
    payload = {**JAM_PAYLOAD, "visibility": "private"}
    resp = client_a.post("/jams", json=payload)
    assert resp.status_code == 201
    code = resp.json()["invite_code"]
    assert code is not None
    assert len(code) == 6
    assert code == code.upper()
    assert code.isalnum()


def test_create_jam_public_no_invite_code(client_a):
    resp = client_a.post("/jams", json=JAM_PAYLOAD)
    assert resp.status_code == 201
    assert resp.json()["invite_code"] is None


# ── GET /jams ─────────────────────────────────────────────────────────────────

def test_list_jams_returns_public_only(client_a, client_b, db_session, user_a, user_b):
    # user_a creates a public jam, user_b creates a private jam
    client_a.post("/jams", json=JAM_PAYLOAD)
    client_b.post("/jams", json={**JAM_PAYLOAD, "visibility": "private", "name": "Secret"})

    resp = client_a.get("/jams")
    assert resp.status_code == 200
    names = [j["name"] for j in resp.json()]
    assert "Blues Night" in names
    assert "Secret" not in names


def test_list_jams_treats_unregistered_authenticated_user_as_guest(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client = TestClient(app, headers={"Authorization": "Bearer uid-not-created"})

    resp = client.get("/jams")

    assert resp.status_code == 200
    assert jam["id"] in [item["id"] for item in resp.json()]


def test_list_jams_prunes_orphan_jams(client_a, db_session):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    jam_id = UUID(jam["id"])

    db_session.query(JamAdmin).filter(JamAdmin.jam_id == jam_id).delete()
    db_session.commit()

    resp = client_a.get("/jams")

    assert resp.status_code == 200
    assert all(item["id"] != jam["id"] for item in resp.json())
    assert db_session.query(Jam).filter(Jam.id == jam_id).first() is None


def test_get_jam_by_id(client_a):
    created = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.get(f"/jams/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_jam_not_found(client_a):
    resp = client_a.get("/jams/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_get_orphan_jam_returns_404_and_deletes_it(client_a, db_session):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    jam_id = UUID(jam["id"])

    db_session.query(JamAdmin).filter(JamAdmin.jam_id == jam_id).delete()
    db_session.commit()

    resp = client_a.get(f"/jams/{jam['id']}")

    assert resp.status_code == 404
    assert db_session.query(Jam).filter(Jam.id == jam_id).first() is None


# ── GET /jams/invite/{code} ───────────────────────────────────────────────────

def test_get_jam_by_invite_code(client_a):
    payload = {**JAM_PAYLOAD, "visibility": "private"}
    jam = client_a.post("/jams", json=payload).json()
    code = jam["invite_code"]

    resp = client_a.get(f"/jams/invite/{code}")
    assert resp.status_code == 200
    assert resp.json()["id"] == jam["id"]


def test_get_jam_by_invite_code_normalizes_case_and_separators(client_a, client_b):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "visibility": "private"}).json()
    code = jam["invite_code"]
    formatted_code = f"{code[:2].lower()}-/{code[2:4]} {code[4:].lower()}"

    resp = client_b.get(f"/jams/invite/{formatted_code}")

    assert resp.status_code == 200
    assert resp.json()["id"] == jam["id"]
    assert resp.json()["invite_code"] is None


def test_get_jam_by_invalid_code(client_a):
    resp = client_a.get("/jams/invite/BADCODE")
    assert resp.status_code == 404


def test_get_private_jam_requires_membership(client_a, anon_client):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "visibility": "private"}).json()
    resp = anon_client.get(f"/jams/{jam['id']}")
    assert resp.status_code == 403


def test_list_private_jam_participants_requires_membership(client_a, anon_client):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "visibility": "private"}).json()
    resp = anon_client.get(f"/jams/{jam['id']}/participants")
    assert resp.status_code == 403


# ── PATCH /jams/{id} ─────────────────────────────────────────────────────────

def test_update_jam_state_as_admin(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.patch(f"/jams/{jam['id']}", json={"state": "tuning"})
    assert resp.status_code == 200
    assert resp.json()["state"] == "tuning"


def test_update_jam_rejects_invalid_state(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.patch(f"/jams/{jam['id']}", json={"state": "paused"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Jam state is invalid"


def test_update_jam_current_song_must_belong_to_jam(client_a):
    jam_a = client_a.post("/jams", json=JAM_PAYLOAD).json()
    jam_b = client_a.post("/jams", json={**JAM_PAYLOAD, "name": "Other Jam"}).json()
    song_a = client_a.post(
        f"/songs/jam/{jam_a['id']}",
        json={"title": "Little Wing", "artist": "Jimi Hendrix"},
    ).json()

    resp = client_a.patch(f"/jams/{jam_b['id']}", json={"current_song_id": song_a["id"]})

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Current song must belong to this jam"


def test_update_jam_can_clear_current_song(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    song = client_a.post(
        f"/songs/jam/{jam['id']}",
        json={"title": "Little Wing", "artist": "Jimi Hendrix"},
    ).json()
    set_resp = client_a.patch(f"/jams/{jam['id']}", json={"current_song_id": song["id"]})
    assert set_resp.status_code == 200
    assert set_resp.json()["current_song_id"] == song["id"]

    clear_resp = client_a.patch(f"/jams/{jam['id']}", json={"current_song_id": None})

    assert clear_resp.status_code == 200
    assert clear_resp.json()["current_song_id"] is None


def test_update_jam_non_admin_forbidden(client_a, client_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    # user_b joins then tries to update state
    client_b.post(f"/jams/{jam['id']}/join")
    resp = client_b.patch(f"/jams/{jam['id']}", json={"state": "tuning"})
    assert resp.status_code == 403


# ── DELETE /jams/{id} ────────────────────────────────────────────────────────

def test_delete_jam_as_admin(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.delete(f"/jams/{jam['id']}")
    assert resp.status_code == 204


def test_delete_jam_non_admin_forbidden(client_a, client_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_b.post(f"/jams/{jam['id']}/join")
    resp = client_b.delete(f"/jams/{jam['id']}")
    assert resp.status_code == 403


# ── POST /jams/{id}/join & leave ─────────────────────────────────────────────

def test_join_jam(client_a, client_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_b.post(f"/jams/{jam['id']}/join")
    assert resp.status_code == 201

    participants = client_a.get(f"/jams/{jam['id']}/participants").json()
    user_ids = [p["user"]["id"] for p in participants]
    assert "uid-b" in user_ids


def test_join_jam_already_participant(client_a):
    """Creator is already a participant, so joining again → 409."""
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.post(f"/jams/{jam['id']}/join")
    assert resp.status_code == 409


def test_join_private_jam_requires_invite_code(client_a, client_b):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "visibility": "private"}).json()

    resp = client_b.post(f"/jams/{jam['id']}/join")
    assert resp.status_code == 403

    code = jam["invite_code"]
    formatted_code = f"{code[:3].lower()}-{code[3:].lower()}"
    resp = client_b.post(f"/jams/{jam['id']}/join?invite_code={formatted_code}")
    assert resp.status_code == 201


def test_regenerate_invite_code_replaces_old_code_for_admin(client_a, client_b):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "visibility": "private"}).json()
    old_code = jam["invite_code"]

    resp = client_a.post(f"/jams/{jam['id']}/invite-code")

    assert resp.status_code == 200
    new_code = resp.json()["invite_code"]
    assert new_code
    assert new_code != old_code

    assert client_b.get(f"/jams/invite/{old_code}").status_code == 404
    assert client_b.get(f"/jams/invite/{new_code}").status_code == 200


def test_regenerate_invite_code_requires_admin(client_a, client_b):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "visibility": "private"}).json()

    resp = client_b.post(f"/jams/{jam['id']}/invite-code")

    assert resp.status_code == 403


def test_regenerate_invite_code_rejects_public_jam(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()

    resp = client_a.post(f"/jams/{jam['id']}/invite-code")

    assert resp.status_code == 400


def test_private_participant_does_not_receive_invite_code(client_a, client_b):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "visibility": "private"}).json()
    client_b.post(f"/jams/{jam['id']}/join?invite_code={jam['invite_code']}")

    resp = client_b.get(f"/jams/{jam['id']}")

    assert resp.status_code == 200
    assert resp.json()["invite_code"] is None


def test_admin_can_switch_public_jam_to_private_and_back(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()

    private_resp = client_a.patch(f"/jams/{jam['id']}", json={"visibility": "private"})
    assert private_resp.status_code == 200
    assert private_resp.json()["visibility"] == "private"
    assert private_resp.json()["invite_code"] is not None

    public_resp = client_a.patch(f"/jams/{jam['id']}", json={"visibility": "public"})
    assert public_resp.status_code == 200
    assert public_resp.json()["visibility"] == "public"
    assert public_resp.json()["invite_code"] is None


def test_leave_jam(client_a, client_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_b.post(f"/jams/{jam['id']}/join")
    resp = client_b.post(f"/jams/{jam['id']}/leave")
    assert resp.status_code == 200


def test_last_admin_leaving_initial_jam_deletes_it(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()

    resp = client_a.post(f"/jams/{jam['id']}/leave")

    assert resp.status_code == 200
    assert resp.json()["deleted_jam"] is True
    assert client_a.get(f"/jams/{jam['id']}").status_code == 404


def test_last_admin_leaving_completed_jam_deletes_it_even_with_other_participants(client_a, client_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    join = client_b.post(f"/jams/{jam['id']}/join")
    assert join.status_code == 201
    update = client_a.patch(f"/jams/{jam['id']}", json={"state": "completed"})
    assert update.status_code == 200

    resp = client_a.post(f"/jams/{jam['id']}/leave")

    assert resp.status_code == 200
    assert resp.json()["deleted_jam"] is True
    assert client_a.get(f"/jams/{jam['id']}").status_code == 404
    assert client_b.get(f"/jams/{jam['id']}").status_code == 404


def test_leave_jam_not_participant(client_a, client_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_b.post(f"/jams/{jam['id']}/leave")
    assert resp.status_code == 404


def test_admin_can_remove_participant_and_cleanup_resources(client_a, client_b):
    jam = client_a.post("/jams", json={**JAM_PAYLOAD, "require_role_approval": True}).json()
    client_b.post(f"/jams/{jam['id']}/join")
    song = client_a.post(
        f"/songs/jam/{jam['id']}",
        json={"title": "Little Wing", "artist": "Jimi Hendrix"},
    ).json()
    client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums")

    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    vocals = next(role for role in roles if role["instrument"] == "Vocals")
    claim = client_b.post(f"/songs/roles/{vocals['id']}/claim")
    assert claim.status_code == 200
    assert claim.json()["pending_user"] == "uid-b"

    resp = client_a.delete(f"/jams/{jam['id']}/participants/uid-b")

    assert resp.status_code == 200
    assert resp.json()["removed_admin"] is False
    participants = client_a.get(f"/jams/{jam['id']}/participants").json()
    assert "uid-b" not in [participant["user"]["id"] for participant in participants]

    hardware = client_a.get(f"/jams/{jam['id']}/hardware").json()
    assert all(item["owner_id"] != "uid-b" for item in hardware)

    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    assert all(role["owner_id"] != "uid-b" for role in roles)
    assert all(role["joined_by"] != "uid-b" for role in roles)
    assert all(role["pending_user"] != "uid-b" for role in roles)


def test_remove_participant_requires_admin(client_a, client_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_b.post(f"/jams/{jam['id']}/join")

    resp = client_b.delete(f"/jams/{jam['id']}/participants/uid-a")

    assert resp.status_code == 403


def test_remove_participant_rejects_self_removal(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()

    resp = client_a.delete(f"/jams/{jam['id']}/participants/uid-a")

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Use leave jam to remove yourself"


# ── Hardware ──────────────────────────────────────────────────────────────────

def test_add_hardware_as_participant(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar")
    assert resp.status_code == 201
    hw = resp.json()
    assert hw["instrument"] == "Guitar"
    assert hw["owner_id"] == "uid-a"
    assert hw["status"] == "approved"

    # Verify it shows up in the jam hardware list
    hw_list = client_a.get(f"/jams/{jam['id']}/hardware").json()
    instruments = [h["instrument"] for h in hw_list]
    assert "Guitar" in instruments


def test_add_hardware_same_owner_deduplicates(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_a.post(f"/songs/jam/{jam['id']}", json={"title": "One", "artist": "Two"})

    first = client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar")
    second = client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar")

    assert first.status_code == 201
    assert second.status_code == 200

    hw_list = client_a.get(f"/jams/{jam['id']}/hardware").json()
    guitar_entries = [h for h in hw_list if h["instrument"] == "Guitar" and h["owner_id"] == "uid-a"]
    assert len(guitar_entries) == 1

    song = client_a.get(f"/songs/jam/{jam['id']}").json()[0]
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    guitar_roles = [role for role in roles if role["instrument"] == "Guitar" and role["owner_id"] == "uid-a"]
    assert len(guitar_roles) == 1


def test_add_hardware_non_participant_forbidden(client_a, client_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums")
    assert resp.status_code == 403


def test_add_hardware_rejects_vocals(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.post(f"/jams/{jam['id']}/hardware?instrument=Vocals")
    assert resp.status_code == 400


def test_hardware_creates_roles_for_existing_songs(client_a):
    """When hardware is approved, roles are created in all existing songs."""
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_a.post(f"/songs/jam/{jam['id']}", json={"title": "Song A", "artist": "X"})
    client_a.post(f"/songs/jam/{jam['id']}", json={"title": "Song B", "artist": "Y"})

    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Bass")

    songs = client_a.get(f"/songs/jam/{jam['id']}").json()
    for song in songs:
        roles = client_a.get(f"/songs/{song['id']}/roles").json()
        bass_roles = [r for r in roles if r["instrument"] == "Bass"]
        assert len(bass_roles) == 1


def test_hardware_pending_when_approval_required(client_a, client_b):
    jam = client_a.post(
        "/jams", json={**JAM_PAYLOAD, "require_hardware_approval": True}
    ).json()
    client_b.post(f"/jams/{jam['id']}/join")

    resp = client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums")
    assert resp.status_code == 201
    assert resp.json()["status"] == "pending"


def test_hardware_admin_bypasses_approval(client_a):
    """Admin-submitted hardware is always auto-approved."""
    jam = client_a.post(
        "/jams", json={**JAM_PAYLOAD, "require_hardware_approval": True}
    ).json()

    resp = client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar")
    assert resp.status_code == 201
    assert resp.json()["status"] == "approved"


def test_approve_hardware(client_a, client_b):
    jam = client_a.post(
        "/jams", json={**JAM_PAYLOAD, "require_hardware_approval": True}
    ).json()
    client_b.post(f"/jams/{jam['id']}/join")
    client_a.post(f"/songs/jam/{jam['id']}", json={"title": "Song", "artist": "A"})

    hw = client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums").json()
    assert hw["status"] == "pending"

    resp = client_a.patch(f"/jams/{jam['id']}/hardware/{hw['id']}/approve")
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"

    # Roles should now exist
    songs = client_a.get(f"/songs/jam/{jam['id']}").json()
    roles = client_a.get(f"/songs/{songs[0]['id']}/roles").json()
    drum_roles = [r for r in roles if r["instrument"] == "Drums"]
    assert len(drum_roles) == 1


def test_reject_hardware(client_a, client_b):
    jam = client_a.post(
        "/jams", json={**JAM_PAYLOAD, "require_hardware_approval": True}
    ).json()
    client_b.post(f"/jams/{jam['id']}/join")

    hw = client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums").json()
    assert hw["status"] == "pending"

    resp = client_a.patch(f"/jams/{jam['id']}/hardware/{hw['id']}/reject")
    assert resp.status_code == 200

    hw_list = client_a.get(f"/jams/{jam['id']}/hardware").json()
    assert len(hw_list) == 0


def test_reject_approved_hardware_conflicts(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    hw = client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar").json()
    resp = client_a.patch(f"/jams/{jam['id']}/hardware/{hw['id']}/reject")
    assert resp.status_code == 409


def test_update_hardware_renames_existing_song_roles(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    song = client_a.post(f"/songs/jam/{jam['id']}", json={"title": "Song", "artist": "A"}).json()
    hw = client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar").json()

    resp = client_a.patch(
        f"/jams/{jam['id']}/hardware/{hw['id']}",
        json={"instrument": "Electric Guitar"},
    )

    assert resp.status_code == 200
    assert resp.json()["instrument"] == "Electric Guitar"
    hw_list = client_a.get(f"/jams/{jam['id']}/hardware").json()
    assert [item["instrument"] for item in hw_list] == ["Electric Guitar"]
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    instruments = [role["instrument"] for role in roles]
    assert "Vocals" in instruments
    assert "Electric Guitar" in instruments


def test_update_hardware_duplicate_conflicts(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    guitar = client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar").json()
    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Bass")

    resp = client_a.patch(
        f"/jams/{jam['id']}/hardware/{guitar['id']}",
        json={"instrument": "Bass"},
    )

    assert resp.status_code == 409


def test_update_hardware_non_owner_non_admin_forbidden(client_a, client_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    hw = client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar").json()
    client_b.post(f"/jams/{jam['id']}/join")

    resp = client_b.patch(
        f"/jams/{jam['id']}/hardware/{hw['id']}",
        json={"instrument": "Bass"},
    )

    assert resp.status_code == 403


def test_remove_own_hardware(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    hw = client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar").json()

    resp = client_a.delete(f"/jams/{jam['id']}/hardware/{hw['id']}")
    assert resp.status_code == 200

    hw_list = client_a.get(f"/jams/{jam['id']}/hardware").json()
    assert len(hw_list) == 0


def test_remove_hardware_removes_unclaimed_generated_roles(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    song = client_a.post(f"/songs/jam/{jam['id']}", json={"title": "Song", "artist": "A"}).json()
    hw = client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar").json()

    resp = client_a.delete(f"/jams/{jam['id']}/hardware/{hw['id']}")

    assert resp.status_code == 200
    roles = client_a.get(f"/songs/{song['id']}/roles").json()
    assert [role for role in roles if role["instrument"] == "Guitar"] == []


def test_remove_hardware_admin_can_remove_others(client_a, client_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_b.post(f"/jams/{jam['id']}/join")
    hw = client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums").json()

    resp = client_a.delete(f"/jams/{jam['id']}/hardware/{hw['id']}")
    assert resp.status_code == 200


def test_remove_hardware_non_owner_non_admin_forbidden(client_a, client_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    hw = client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar").json()
    client_b.post(f"/jams/{jam['id']}/join")

    resp = client_b.delete(f"/jams/{jam['id']}/hardware/{hw['id']}")
    assert resp.status_code == 403


def test_pending_hardware_no_roles_created(client_a, client_b):
    """Pending hardware should NOT create roles in songs."""
    jam = client_a.post(
        "/jams", json={**JAM_PAYLOAD, "require_hardware_approval": True}
    ).json()
    client_b.post(f"/jams/{jam['id']}/join")
    client_a.post(f"/songs/jam/{jam['id']}", json={"title": "Song", "artist": "A"})

    hw = client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums").json()
    assert hw["status"] == "pending"

    songs = client_a.get(f"/songs/jam/{jam['id']}").json()
    roles = client_a.get(f"/songs/{songs[0]['id']}/roles").json()
    drum_roles = [r for r in roles if r["instrument"] == "Drums"]
    assert len(drum_roles) == 0


def test_list_hardware_guest_sees_approved_only(client_a, client_b, anon_client):
    """Unauthenticated users only see approved hardware on public jams."""
    jam = client_a.post(
        "/jams", json={**JAM_PAYLOAD, "require_hardware_approval": True}
    ).json()
    client_b.post(f"/jams/{jam['id']}/join")

    client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar")  # approved (admin)
    client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums")   # pending

    hw_list = anon_client.get(f"/jams/{jam['id']}/hardware").json()
    assert len(hw_list) == 1
    assert hw_list[0]["instrument"] == "Guitar"


# ── Admin management ─────────────────────────────────────────────────────────

def test_add_admin(client_a, client_b, user_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.post(f"/jams/{jam['id']}/admins/{user_b.id}")
    assert resp.status_code == 201
    assert resp.json()["already_admin"] is False
    assert resp.json()["joined_as_participant"] is True

    jam_data = client_a.get(f"/jams/{jam['id']}").json()
    assert user_b.id in jam_data["admin_ids"]
    participants = client_a.get(f"/jams/{jam['id']}/participants").json()
    participant_ids = [participant["user"]["id"] for participant in participants]
    assert user_b.id in participant_ids


def test_add_admin_duplicate(client_a, user_a):
    """Adding a user who is already admin is treated as an idempotent success."""
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.post(f"/jams/{jam['id']}/admins/{user_a.id}")
    assert resp.status_code == 200
    assert resp.json()["already_admin"] is True
    assert resp.json()["joined_as_participant"] is False


def test_add_admin_non_admin_forbidden(client_a, client_b, user_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_b.post(f"/jams/{jam['id']}/join")
    resp = client_b.post(f"/jams/{jam['id']}/admins/{user_a.id}")
    assert resp.status_code == 403


def test_add_admin_user_not_found(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.post(f"/jams/{jam['id']}/admins/missing-user")
    assert resp.status_code == 404


def test_remove_admin(client_a, client_b, user_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_a.post(f"/jams/{jam['id']}/admins/{user_b.id}")

    resp = client_a.delete(f"/jams/{jam['id']}/admins/{user_b.id}")

    assert resp.status_code == 200
    assert resp.json()["already_removed"] is False
    jam_data = client_a.get(f"/jams/{jam['id']}").json()
    assert user_b.id not in jam_data["admin_ids"]


def test_remove_participant_removes_admin_role_for_target_admin(client_a, user_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_a.post(f"/jams/{jam['id']}/admins/{user_b.id}")

    resp = client_a.delete(f"/jams/{jam['id']}/participants/{user_b.id}")

    assert resp.status_code == 200
    assert resp.json()["removed_admin"] is True
    jam_data = client_a.get(f"/jams/{jam['id']}").json()
    assert user_b.id not in jam_data["admin_ids"]
    participants = client_a.get(f"/jams/{jam['id']}/participants").json()
    assert user_b.id not in [participant["user"]["id"] for participant in participants]


def test_remove_admin_already_removed_is_idempotent(client_a, client_b, user_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_a.post(f"/jams/{jam['id']}/admins/{user_b.id}")
    client_a.delete(f"/jams/{jam['id']}/admins/{user_b.id}")

    resp = client_a.delete(f"/jams/{jam['id']}/admins/{user_b.id}")

    assert resp.status_code == 200
    assert resp.json()["already_removed"] is True


def test_remove_last_admin_forbidden(client_a, user_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()

    resp = client_a.delete(f"/jams/{jam['id']}/admins/{user_a.id}")

    assert resp.status_code == 400

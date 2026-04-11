"""Tests for /jams endpoints."""
import pytest
from unittest.mock import AsyncMock, patch

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
    assert resp.json()["invite_code"] is not None


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


def test_get_jam_by_id(client_a):
    created = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.get(f"/jams/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_jam_not_found(client_a):
    resp = client_a.get("/jams/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


# ── GET /jams/invite/{code} ───────────────────────────────────────────────────

def test_get_jam_by_invite_code(client_a):
    payload = {**JAM_PAYLOAD, "visibility": "private"}
    jam = client_a.post("/jams", json=payload).json()
    code = jam["invite_code"]

    resp = client_a.get(f"/jams/invite/{code}")
    assert resp.status_code == 200
    assert resp.json()["id"] == jam["id"]


def test_get_jam_by_invalid_code(client_a):
    resp = client_a.get("/jams/invite/BADCODE")
    assert resp.status_code == 404


# ── PATCH /jams/{id} ─────────────────────────────────────────────────────────

def test_update_jam_state_as_admin(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.patch(f"/jams/{jam['id']}", json={"state": "tuning"})
    assert resp.status_code == 200
    assert resp.json()["state"] == "tuning"


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


def test_leave_jam(client_a, client_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_b.post(f"/jams/{jam['id']}/join")
    resp = client_b.post(f"/jams/{jam['id']}/leave")
    assert resp.status_code == 200


def test_leave_jam_not_participant(client_a, client_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_b.post(f"/jams/{jam['id']}/leave")
    assert resp.status_code == 404


# ── POST /jams/{id}/hardware ─────────────────────────────────────────────────

def test_add_hardware_as_participant(client_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.post(f"/jams/{jam['id']}/hardware?instrument=Guitar")
    assert resp.status_code == 200
    hardware = resp.json().get("hardware") or []
    instruments = [h["instrument"] for h in hardware]
    assert "Guitar" in instruments


def test_add_hardware_non_participant_forbidden(client_a, client_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_b.post(f"/jams/{jam['id']}/hardware?instrument=Drums")
    assert resp.status_code == 403


# ── Admin management ─────────────────────────────────────────────────────────

def test_add_admin(client_a, client_b, user_b):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.post(f"/jams/{jam['id']}/admins/{user_b.id}")
    assert resp.status_code == 201

    jam_data = client_a.get(f"/jams/{jam['id']}").json()
    assert user_b.id in jam_data["admin_ids"]


def test_add_admin_duplicate(client_a, user_a):
    """Adding a user who is already admin → 409."""
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.post(f"/jams/{jam['id']}/admins/{user_a.id}")
    assert resp.status_code == 409


def test_add_admin_non_admin_forbidden(client_a, client_b, user_a):
    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    client_b.post(f"/jams/{jam['id']}/join")
    resp = client_b.post(f"/jams/{jam['id']}/admins/{user_a.id}")
    assert resp.status_code == 403

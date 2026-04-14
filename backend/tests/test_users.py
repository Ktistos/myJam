"""Tests for /users endpoints."""
import pytest
from fastapi.testclient import TestClient

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.main import app


def _override_db(db_session):
    def override():
        yield db_session
    return override


def _override_uid(uid):
    return lambda: uid

# ── POST /users ───────────────────────────────────────────────────────────────

def test_create_user(db_session):
    """New user is created from the authenticated token UID, not body.id."""
    app.dependency_overrides[get_db] = _override_db(db_session)
    app.dependency_overrides[get_current_user_id] = _override_uid("new-uid")

    client = TestClient(app, headers={"Authorization": "Bearer new-uid"})
    resp = client.post("/users", json={
        "id": "spoofed-uid",
        "name": "New User",
        "bio": "hello",
        "recording_link": "",
        "avatar_url": "",
        "instruments": [],
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["id"] == "new-uid"
    assert data["name"] == "New User"

    app.dependency_overrides.clear()


def test_create_user_requires_auth(db_session):
    app.dependency_overrides[get_db] = _override_db(db_session)

    client = TestClient(app)
    resp = client.post("/users", json={"name": "New User"})
    assert resp.status_code == 403

    app.dependency_overrides.clear()


def test_create_user_conflict(db_session, user_a):
    """Creating a user with a duplicate ID returns 409."""
    app.dependency_overrides[get_db] = _override_db(db_session)
    app.dependency_overrides[get_current_user_id] = _override_uid(user_a.id)

    client = TestClient(app, headers={"Authorization": f"Bearer {user_a.id}"})
    resp = client.post("/users", json={
        "id": "spoofed-uid",
        "name": "Duplicate",
        "bio": "", "recording_link": "", "avatar_url": "",
        "instruments": [],
    })
    assert resp.status_code == 409

    app.dependency_overrides.clear()


def test_create_user_with_instruments(db_session):
    """Instruments are persisted on user creation."""
    app.dependency_overrides[get_db] = _override_db(db_session)
    app.dependency_overrides[get_current_user_id] = _override_uid("inst-uid")

    client = TestClient(app, headers={"Authorization": "Bearer inst-uid"})
    resp = client.post("/users", json={
        "name": "Player",
        "bio": "", "recording_link": "", "avatar_url": "",
        "instruments": [
            {"instrument": "guitar", "skill_level": "advanced"},
            {"instrument": "bass",   "skill_level": "beginner"},
        ],
    })
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["instruments"]) == 2

    app.dependency_overrides.clear()


# ── GET /users/me ─────────────────────────────────────────────────────────────

def test_get_me(client_a, user_a):
    resp = client_a.get("/users/me")
    assert resp.status_code == 200
    assert resp.json()["id"] == user_a.id


def test_get_me_unauthenticated(db_session):
    """Without auth override, missing token returns 403."""
    app.dependency_overrides[get_db] = _override_db(db_session)
    client = TestClient(app)
    resp = client.get("/users/me")
    assert resp.status_code == 403
    app.dependency_overrides.clear()


# ── GET /users/{id} ───────────────────────────────────────────────────────────

def test_get_user_by_id(client_a, user_a):
    resp = client_a.get(f"/users/{user_a.id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == user_a.name


def test_get_user_not_found(client_a):
    resp = client_a.get("/users/does-not-exist")
    assert resp.status_code == 404


# ── PATCH /users/me ───────────────────────────────────────────────────────────

def test_update_me_name(client_a, user_a):
    resp = client_a.patch("/users/me", json={"name": "Alice Updated"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Alice Updated"


def test_update_me_instruments_replaced(client_a, user_a):
    """Instruments list is fully replaced on update."""
    resp = client_a.patch("/users/me", json={
        "instruments": [{"instrument": "drums", "skill_level": "intermediate"}]
    })
    assert resp.status_code == 200
    insts = resp.json()["instruments"]
    assert len(insts) == 1
    assert insts[0]["instrument"] == "drums"

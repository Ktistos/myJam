"""Postgres-backed concurrency checks for jam and role actions.

These tests intentionally use a real Postgres database because SQLite will not
exercise row locks or duplicate-key behavior the same way. They target the
same-account and conflicting multi-browser cases that are hard to cover with
pure unit tests.
"""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4
from unittest.mock import AsyncMock, patch

import psycopg2
import pytest
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.auth import get_current_user, get_optional_current_user
from app.core.database import Base, get_db
from app.main import app
from app.models.user import User

POSTGRES_ADMIN_URL = os.getenv(
    "TEST_POSTGRES_ADMIN_URL",
    "postgresql://postgres:password@localhost:5432/postgres",
)
POSTGRES_DB_TEMPLATE = os.getenv("TEST_POSTGRES_DB_TEMPLATE", "jam_test_{suffix}")

JAM_PAYLOAD = {
    "name": "Concurrency Jam",
    "date": "2026-06-01T20:00:00",
    "visibility": "public",
    "address": "Lock Street 1",
    "lat": 35.0,
    "lng": 25.0,
}


def _db_url_for(name: str) -> str:
    base, _, _ = POSTGRES_ADMIN_URL.rpartition("/")
    return f"{base}/{name}"


def _client_for(uid: str) -> TestClient:
    return TestClient(app, headers={"Authorization": f"Bearer {uid}"})


def _role_by_instrument(roles: list[dict], instrument: str) -> dict:
    return next(role for role in roles if role["instrument"] == instrument)


@pytest.fixture(scope="function")
def postgres_harness():
    db_name = POSTGRES_DB_TEMPLATE.format(suffix=uuid4().hex[:8])

    try:
        admin_conn = psycopg2.connect(POSTGRES_ADMIN_URL)
        admin_conn.autocommit = True
    except psycopg2.Error as exc:
        pytest.skip(f"Postgres not available for concurrency tests: {exc}")

    with admin_conn.cursor() as cur:
        cur.execute(f'CREATE DATABASE "{db_name}"')

    test_engine = create_engine(_db_url_for(db_name), pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=test_engine)

    bearer = HTTPBearer(auto_error=False)

    def override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    def auth_from_token(creds=Depends(bearer)):
        if creds is None:
            raise HTTPException(status_code=403, detail="No credentials")
        db = SessionLocal()
        try:
            user = db.get(User, creds.credentials)
            if not user:
                raise HTTPException(status_code=403, detail=f"No user {creds.credentials}")
            return user
        finally:
            db.close()

    def optional_auth_from_token(creds=Depends(bearer)):
        if creds is None:
            return None
        db = SessionLocal()
        try:
            user = db.get(User, creds.credentials)
            if not user:
                raise HTTPException(status_code=403, detail=f"No user {creds.credentials}")
            return user
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = auth_from_token
    app.dependency_overrides[get_optional_current_user] = optional_auth_from_token

    def seed_user(uid: str, name: str) -> None:
        db = SessionLocal()
        try:
            db.add(User(id=uid, name=name, bio="", recording_link="", avatar_url=""))
            db.commit()
        finally:
            db.close()

    try:
        with patch("app.api.routers.jams.publish", new_callable=AsyncMock), \
             patch("app.api.routers.songs.publish", new_callable=AsyncMock):
            yield {
                "seed_user": seed_user,
                "make_client": _client_for,
            }
    finally:
        app.dependency_overrides.clear()
        test_engine.dispose()
        with admin_conn.cursor() as cur:
            cur.execute(
                """
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = %s AND pid <> pg_backend_pid()
                """,
                (db_name,),
            )
            cur.execute(f'DROP DATABASE IF EXISTS "{db_name}"')
        admin_conn.close()


def test_postgres_concurrent_join_same_user_serializes_cleanly(postgres_harness):
    postgres_harness["seed_user"]("uid-owner", "Owner")
    postgres_harness["seed_user"]("uid-racer", "Racer")

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        jam = owner_client.post("/jams", json=JAM_PAYLOAD).json()

    barrier = Barrier(2)

    def join_once():
        with postgres_harness["make_client"]("uid-racer") as client:
            barrier.wait()
            resp = client.post(f"/jams/{jam['id']}/join")
            return resp.status_code, resp.json()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: join_once(), range(2)))

    statuses = sorted(status for status, _ in results)
    assert statuses == [201, 409]

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        participants = owner_client.get(f"/jams/{jam['id']}/participants").json()
    joined_ids = [p["user"]["id"] for p in participants]
    assert joined_ids.count("uid-racer") == 1


def test_postgres_concurrent_leave_same_user_is_single_effect(postgres_harness):
    postgres_harness["seed_user"]("uid-owner", "Owner")
    postgres_harness["seed_user"]("uid-racer", "Racer")

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        jam = owner_client.post("/jams", json=JAM_PAYLOAD).json()
    with postgres_harness["make_client"]("uid-racer") as racer_client:
        assert racer_client.post(f"/jams/{jam['id']}/join").status_code == 201

    barrier = Barrier(2)

    def leave_once():
        with postgres_harness["make_client"]("uid-racer") as client:
            barrier.wait()
            resp = client.post(f"/jams/{jam['id']}/leave")
            return resp.status_code, resp.json() if resp.content else None

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: leave_once(), range(2)))

    statuses = sorted(status for status, _ in results)
    assert statuses == [200, 404]

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        participants = owner_client.get(f"/jams/{jam['id']}/participants").json()
        jam_after = owner_client.get(f"/jams/{jam['id']}").json()
    joined_ids = [p["user"]["id"] for p in participants]
    assert "uid-racer" not in joined_ids
    assert jam_after["participant_count"] == 1


def test_postgres_concurrent_last_admin_leave_deletes_once_even_with_other_participants(postgres_harness):
    postgres_harness["seed_user"]("uid-owner", "Owner")
    postgres_harness["seed_user"]("uid-racer", "Racer")

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        jam = owner_client.post("/jams", json=JAM_PAYLOAD).json()
        assert owner_client.patch(f"/jams/{jam['id']}", json={"state": "completed"}).status_code == 200

    with postgres_harness["make_client"]("uid-racer") as racer_client:
        assert racer_client.post(f"/jams/{jam['id']}/join").status_code == 201

    barrier = Barrier(2)

    def leave_once():
        with postgres_harness["make_client"]("uid-owner") as client:
            barrier.wait()
            resp = client.post(f"/jams/{jam['id']}/leave")
            body = resp.json() if resp.content else None
            return resp.status_code, body

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: leave_once(), range(2)))

    statuses = sorted(status for status, _ in results)
    assert statuses == [200, 404]
    success_payloads = [body for status, body in results if status == 200]
    assert success_payloads == [{"detail": "Jam deleted", "deleted_jam": True}]

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        resp = owner_client.get(f"/jams/{jam['id']}")
    assert resp.status_code == 404


def test_postgres_concurrent_role_claim_same_user_is_idempotent(postgres_harness):
    postgres_harness["seed_user"]("uid-owner", "Owner")
    postgres_harness["seed_user"]("uid-racer", "Racer")

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        jam = owner_client.post("/jams", json=JAM_PAYLOAD).json()
        assert owner_client.post(f"/jams/{jam['id']}/hardware?instrument=Guitar").status_code == 201
        song = owner_client.post(
            f"/songs/jam/{jam['id']}",
            json={"title": "Lock Song", "artist": "The Serializers"},
        ).json()
        role = _role_by_instrument(owner_client.get(f"/songs/{song['id']}/roles").json(), "Guitar")

    with postgres_harness["make_client"]("uid-racer") as racer_client:
        assert racer_client.post(f"/jams/{jam['id']}/join").status_code == 201

    barrier = Barrier(2)

    def claim_once():
        with postgres_harness["make_client"]("uid-racer") as client:
            barrier.wait()
            resp = client.post(f"/songs/roles/{role['id']}/claim")
            return resp.status_code, resp.json()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: claim_once(), range(2)))

    statuses = sorted(status for status, _ in results)
    assert statuses == [200, 200]
    assert all(body["joined_by"] == "uid-racer" for _, body in results)

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        role_after = _role_by_instrument(owner_client.get(f"/songs/{song['id']}/roles").json(), "Guitar")
    assert role_after["joined_by"] == "uid-racer"
    assert role_after["pending_user"] is None


def test_postgres_concurrent_role_claim_different_users_single_winner(postgres_harness):
    postgres_harness["seed_user"]("uid-owner", "Owner")
    postgres_harness["seed_user"]("uid-racer-a", "Racer A")
    postgres_harness["seed_user"]("uid-racer-b", "Racer B")

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        jam = owner_client.post("/jams", json=JAM_PAYLOAD).json()
        assert owner_client.post(f"/jams/{jam['id']}/hardware?instrument=Bass").status_code == 201
        song = owner_client.post(
            f"/songs/jam/{jam['id']}",
            json={"title": "Race Song", "artist": "The Locks"},
        ).json()
        role = _role_by_instrument(owner_client.get(f"/songs/{song['id']}/roles").json(), "Bass")

    for uid in ("uid-racer-a", "uid-racer-b"):
        with postgres_harness["make_client"](uid) as client:
            assert client.post(f"/jams/{jam['id']}/join").status_code == 201

    barrier = Barrier(2)

    def claim_once(uid: str):
        with postgres_harness["make_client"](uid) as client:
            barrier.wait()
            resp = client.post(f"/songs/roles/{role['id']}/claim")
            return uid, resp.status_code, resp.json()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(claim_once, ("uid-racer-a", "uid-racer-b")))

    statuses = sorted(status for _, status, _ in results)
    assert statuses == [200, 409]

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        role_after = _role_by_instrument(owner_client.get(f"/songs/{song['id']}/roles").json(), "Bass")
    assert role_after["joined_by"] in {"uid-racer-a", "uid-racer-b"}
    assert role_after["pending_user"] is None


def test_postgres_concurrent_role_review_conflict_serializes(postgres_harness):
    postgres_harness["seed_user"]("uid-owner", "Owner")
    postgres_harness["seed_user"]("uid-racer", "Racer")

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        jam = owner_client.post(
            "/jams",
            json={**JAM_PAYLOAD, "require_role_approval": True},
        ).json()
        assert owner_client.post(f"/jams/{jam['id']}/hardware?instrument=Drums").status_code == 201
        song = owner_client.post(
            f"/songs/jam/{jam['id']}",
            json={"title": "Decision Song", "artist": "The Moderators"},
        ).json()
        role = _role_by_instrument(owner_client.get(f"/songs/{song['id']}/roles").json(), "Drums")

    with postgres_harness["make_client"]("uid-racer") as racer_client:
        assert racer_client.post(f"/jams/{jam['id']}/join").status_code == 201
        assert racer_client.post(f"/songs/roles/{role['id']}/claim").status_code == 200

    barrier = Barrier(2)

    def review_once(action: str):
        with postgres_harness["make_client"]("uid-owner") as client:
            barrier.wait()
            resp = client.patch(f"/songs/roles/{role['id']}/{action}")
            return action, resp.status_code, resp.json()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(review_once, ("approve", "reject")))

    statuses = sorted(status for _, status, _ in results)
    assert statuses == [200, 409]

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        role_after = _role_by_instrument(owner_client.get(f"/songs/{song['id']}/roles").json(), "Drums")
    assert role_after["pending_user"] is None
    assert role_after["joined_by"] in {None, "uid-racer"}


def test_postgres_concurrent_add_admin_same_target_is_idempotent(postgres_harness):
    postgres_harness["seed_user"]("uid-owner", "Owner")
    postgres_harness["seed_user"]("uid-target", "Target")

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        jam = owner_client.post("/jams", json=JAM_PAYLOAD).json()

    barrier = Barrier(2)

    def add_once():
        with postgres_harness["make_client"]("uid-owner") as client:
            barrier.wait()
            resp = client.post(f"/jams/{jam['id']}/admins/uid-target")
            return resp.status_code, resp.json()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: add_once(), range(2)))

    statuses = sorted(status for status, _ in results)
    assert statuses == [200, 201]
    assert sorted(body["already_admin"] for _, body in results) == [False, True]
    assert sorted(body["joined_as_participant"] for _, body in results) == [False, True]

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        jam_after = owner_client.get(f"/jams/{jam['id']}").json()
        participants = owner_client.get(f"/jams/{jam['id']}/participants").json()
    assert jam_after["admin_ids"].count("uid-target") == 1
    joined_ids = [participant["user"]["id"] for participant in participants]
    assert joined_ids.count("uid-target") == 1


def test_postgres_concurrent_add_hardware_same_owner_deduplicates(postgres_harness):
    postgres_harness["seed_user"]("uid-owner", "Owner")

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        jam = owner_client.post("/jams", json=JAM_PAYLOAD).json()
        song = owner_client.post(
            f"/songs/jam/{jam['id']}",
            json={"title": "Hardware Song", "artist": "The Locks"},
        ).json()

    barrier = Barrier(2)

    def add_once():
        with postgres_harness["make_client"]("uid-owner") as client:
            barrier.wait()
            resp = client.post(f"/jams/{jam['id']}/hardware?instrument=Keys")
            return resp.status_code, resp.json()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: add_once(), range(2)))

    statuses = sorted(status for status, _ in results)
    assert statuses == [200, 201]

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        jam_after = owner_client.get(f"/jams/{jam['id']}").json()
        role_after = owner_client.get(f"/songs/{song['id']}/roles").json()

    hardware_entries = [
        item for item in jam_after["hardware"]
        if item["instrument"] == "Keys" and item["owner_id"] == "uid-owner"
    ]
    assert len(hardware_entries) == 1

    matching_roles = [
        role for role in role_after
        if role["instrument"] == "Keys" and role["owner_id"] == "uid-owner"
    ]
    assert len(matching_roles) == 1


def test_postgres_concurrent_song_update_and_delete_do_not_500(postgres_harness):
    postgres_harness["seed_user"]("uid-owner", "Owner")

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        jam = owner_client.post("/jams", json=JAM_PAYLOAD).json()
        song = owner_client.post(
            f"/songs/jam/{jam['id']}",
            json={"title": "Before", "artist": "The Locks"},
        ).json()

    barrier = Barrier(2)

    def update_once():
        with postgres_harness["make_client"]("uid-owner") as client:
            barrier.wait()
            resp = client.patch(f"/songs/{song['id']}", json={"title": "After"})
            return "update", resp.status_code, resp.json() if resp.content else None

    def delete_once():
        with postgres_harness["make_client"]("uid-owner") as client:
            barrier.wait()
            resp = client.delete(f"/songs/{song['id']}")
            return "delete", resp.status_code, resp.json() if resp.content else None

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda fn: fn(), (update_once, delete_once)))

    statuses = [status for _, status, _ in results]
    assert statuses.count(204) == 1
    assert set(statuses).issubset({200, 204, 404})

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        songs_after = owner_client.get(f"/songs/jam/{jam['id']}").json()
    assert songs_after == []


def test_postgres_concurrent_role_claim_and_song_delete_do_not_deadlock(postgres_harness):
    postgres_harness["seed_user"]("uid-owner", "Owner")
    postgres_harness["seed_user"]("uid-racer", "Racer")

    with postgres_harness["make_client"]("uid-owner") as owner_client:
        jam = owner_client.post("/jams", json=JAM_PAYLOAD).json()
        assert owner_client.post(f"/jams/{jam['id']}/hardware?instrument=Lead").status_code == 201
        song = owner_client.post(
            f"/songs/jam/{jam['id']}",
            json={"title": "Deadlock Song", "artist": "The Serializers"},
        ).json()
        role = _role_by_instrument(owner_client.get(f"/songs/{song['id']}/roles").json(), "Lead")

    with postgres_harness["make_client"]("uid-racer") as racer_client:
        assert racer_client.post(f"/jams/{jam['id']}/join").status_code == 201

    barrier = Barrier(2)

    def claim_once():
        with postgres_harness["make_client"]("uid-racer") as client:
            barrier.wait()
            resp = client.post(f"/songs/roles/{role['id']}/claim")
            return "claim", resp.status_code, resp.json() if resp.content else None

    def delete_once():
        with postgres_harness["make_client"]("uid-owner") as client:
            barrier.wait()
            resp = client.delete(f"/songs/{song['id']}")
            return "delete", resp.status_code, resp.json() if resp.content else None

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(claim_once), executor.submit(delete_once)]
        results = [future.result(timeout=10) for future in futures]

    statuses = [status for _, status, _ in results]
    assert statuses.count(204) == 1
    assert set(statuses).issubset({200, 204, 404})

"""Tests for event token exchange and jam event auth."""

import json
import anyio
from uuid import UUID


JAM_PAYLOAD = {
    "name": "Private Stream Jam",
    "date": "2025-06-01T20:00:00",
    "visibility": "private",
    "address": "The Rusty Nail",
    "lat": 37.77,
    "lng": -122.42,
}

PUBLIC_JAM_PAYLOAD = {
    **JAM_PAYLOAD,
    "name": "Public Stream Jam",
    "visibility": "public",
}


class FakePubSub:
    def __init__(self):
        self._sent = False

    async def subscribe(self, _channel):
        return None

    async def get_message(self, ignore_subscribe_messages=True, timeout=25):
        if self._sent:
            return None
        self._sent = True
        return {"data": json.dumps({"type": "ping"})}

    async def unsubscribe(self, _channel):
        return None


class FakeRedis:
    def __init__(self):
        self._store = {}

    async def setex(self, key, ttl, value):
        self._store[key] = value

    async def get(self, key):
        return self._store.get(key)

    async def delete(self, key):
        self._store.pop(key, None)

    async def getdel(self, key):
        value = self._store.get(key)
        await self.delete(key)
        return value

    def pubsub(self):
        return FakePubSub()


def test_create_event_token_requires_jam_access(client_a, client_b, monkeypatch):
    from app.api.routers import events

    fake_redis = FakeRedis()
    monkeypatch.setattr(events, "get_redis", lambda: fake_redis)

    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()

    owner_resp = client_a.post(f"/events/jam/{jam['id']}/token")
    stranger_resp = client_b.post(f"/events/jam/{jam['id']}/token")

    assert owner_resp.status_code == 201
    assert owner_resp.json()["token"]
    assert stranger_resp.status_code == 403


def test_public_jam_event_token_requires_participation(client_a, client_b, monkeypatch):
    from app.api.routers import events

    fake_redis = FakeRedis()
    monkeypatch.setattr(events, "get_redis", lambda: fake_redis)

    jam = client_a.post("/jams", json=PUBLIC_JAM_PAYLOAD).json()

    owner_resp = client_a.post(f"/events/jam/{jam['id']}/token")
    stranger_resp = client_b.post(f"/events/jam/{jam['id']}/token")

    assert owner_resp.status_code == 201
    assert stranger_resp.status_code == 403


def test_event_access_is_revoked_after_participant_leaves(client_a, client_b, db_session):
    from app.api.routers import events

    jam = client_a.post("/jams", json=PUBLIC_JAM_PAYLOAD).json()
    client_b.post(f"/jams/{jam['id']}/join")
    jam_id = UUID(jam["id"])
    assert events._has_event_access(db_session, jam_id, "uid-b") is True

    leave_resp = client_b.post(f"/jams/{jam['id']}/leave")

    assert leave_resp.status_code == 200
    assert events._has_event_access(db_session, jam_id, "uid-b") is False


def test_public_jam_events_require_event_token(client_a, monkeypatch):
    from app.api.routers import events

    fake_redis = FakeRedis()
    monkeypatch.setattr(events, "get_redis", lambda: fake_redis)

    jam = client_a.post("/jams", json=PUBLIC_JAM_PAYLOAD).json()
    resp = client_a.get(f"/events/jam/{jam['id']}")

    assert resp.status_code == 401


def test_private_jam_events_reject_invalid_event_token(client_a, monkeypatch):
    from app.api.routers import events

    fake_redis = FakeRedis()
    monkeypatch.setattr(events, "get_redis", lambda: fake_redis)

    jam = client_a.post("/jams", json=JAM_PAYLOAD).json()
    resp = client_a.get(f"/events/jam/{jam['id']}?token=not-a-real-token")

    assert resp.status_code == 401


def test_events_reject_token_for_different_jam(client_a, monkeypatch):
    from app.api.routers import events

    fake_redis = FakeRedis()
    monkeypatch.setattr(events, "get_redis", lambda: fake_redis)

    first_jam = client_a.post("/jams", json=PUBLIC_JAM_PAYLOAD).json()
    second_jam = client_a.post("/jams", json={**PUBLIC_JAM_PAYLOAD, "name": "Second"}).json()
    token = client_a.post(f"/events/jam/{first_jam['id']}/token").json()["token"]

    resp = client_a.get(f"/events/jam/{second_jam['id']}?token={token}")

    assert resp.status_code == 401


def test_event_tokens_are_single_use(client_a, monkeypatch):
    from app.api.routers import events

    fake_redis = FakeRedis()
    monkeypatch.setattr(events, "get_redis", lambda: fake_redis)

    jam = client_a.post("/jams", json=PUBLIC_JAM_PAYLOAD).json()
    token = client_a.post(f"/events/jam/{jam['id']}/token").json()["token"]

    first = anyio.run(events._consume_event_token, token)
    second = anyio.run(events._consume_event_token, token)

    assert first["jam_id"] == jam["id"]
    assert second is None

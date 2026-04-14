"""
Shared fixtures for myJam backend tests.
Uses SQLite in-memory so no Postgres is needed.
Firebase auth and Redis are mocked out.

Auth approach: each TestClient sends a synthetic "Bearer <uid>" token.
A single override for get_current_user reads the token and maps it to a
User loaded from the test DB — so multiple clients with different users
can coexist in one test without clobbering app.dependency_overrides.
"""
import os
import pytest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi.security import HTTPBearer
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("MINIO_ACCESS_KEY", "test")
os.environ.setdefault("MINIO_SECRET_KEY", "test")
os.environ.setdefault("FIREBASE_PROJECT_ID", "test")

from app.core import spotify as spotify_core
from app.core.database import Base, get_db
from app.core.auth import get_current_user, get_current_user_id, get_optional_current_user
from app.main import app
from app.api.routers import songs as songs_router
from app.models.user import User

SQLITE_URL = "sqlite://"


# ── Engine / session ──────────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def db_engine():
    engine = create_engine(
        SQLITE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # SQLite has no native UUID type; teach the compiler to use CHAR(36)
    from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler
    if not getattr(SQLiteTypeCompiler, "_uuid_patched", False):
        SQLiteTypeCompiler.visit_UUID = lambda self, type_, **kw: "CHAR(36)"
        SQLiteTypeCompiler._uuid_patched = True

    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db_session(db_engine):
    Session = sessionmaker(bind=db_engine)
    session = Session()
    yield session
    session.close()


# ── Seed users ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def user_a(db_session):
    u = User(id="uid-a", name="Alice", bio="bassist", recording_link="", avatar_url="")
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def user_b(db_session):
    u = User(id="uid-b", name="Bob", bio="drummer", recording_link="", avatar_url="")
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


# ── Shared app setup ──────────────────────────────────────────────────────────

@pytest.fixture(scope="function", autouse=False)
def patched_app(db_session):
    """
    Override DB and auth once per test.
    Auth reads the 'Authorization: Bearer <uid>' header and returns
    the matching User from the test DB. Tests just send the uid as token.
    """
    def override_db():
        yield db_session

    # Simpler inline version ↓
    from fastapi import Depends

    bearer = HTTPBearer(auto_error=False)

    def auth_from_token(creds=Depends(bearer)):
        if creds is None:
            raise HTTPException(status_code=403, detail="No credentials")
        uid = creds.credentials          # we use the uid itself as the "token"
        user = db_session.get(User, uid)
        if not user:
            raise HTTPException(status_code=403, detail=f"No user {uid}")
        return user

    def optional_auth_from_token(creds=Depends(bearer)):
        if creds is None:
            return None
        uid = creds.credentials
        user = db_session.get(User, uid)
        if not user:
            return None
        return user

    def uid_from_token(creds=Depends(bearer)):
        if creds is None:
            raise HTTPException(status_code=403, detail="No credentials")
        return creds.credentials

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = auth_from_token
    app.dependency_overrides[get_current_user_id] = uid_from_token
    app.dependency_overrides[get_optional_current_user] = optional_auth_from_token

    with patch("app.api.routers.jams.publish",  new_callable=AsyncMock), \
         patch("app.api.routers.songs.publish", new_callable=AsyncMock):
        yield

    app.dependency_overrides.clear()


# ── Per-user clients ─────────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def client_a(patched_app, user_a):
    """TestClient authenticated as user_a — sends 'Bearer uid-a'."""
    return TestClient(app, headers={"Authorization": f"Bearer {user_a.id}"})


@pytest.fixture(scope="function")
def client_b(patched_app, user_b):
    """TestClient authenticated as user_b — sends 'Bearer uid-b'."""
    return TestClient(app, headers={"Authorization": f"Bearer {user_b.id}"})


@pytest.fixture(scope="function")
def anon_client(patched_app):
    return TestClient(app)


@pytest.fixture(scope="function", autouse=True)
def reset_spotify_test_config(monkeypatch):
    """Keep Spotify-related tests independent from local .env credentials."""
    for module_settings in (songs_router.settings, spotify_core.settings):
        monkeypatch.setattr(module_settings, "SPOTIFY_CLIENT_ID", "")
        monkeypatch.setattr(module_settings, "SPOTIFY_CLIENT_SECRET", "")
    monkeypatch.setattr(songs_router.settings, "SPOTIFY_MARKET", "US")
    monkeypatch.setattr(spotify_core.settings, "SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8000/spotify/callback")
    monkeypatch.setattr(spotify_core.settings, "FRONTEND_URL", "http://localhost:8080")
    monkeypatch.setattr(songs_router, "_spotify_access_token", None)
    monkeypatch.setattr(songs_router, "_spotify_access_token_expires_at", 0.0)

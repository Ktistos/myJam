"""
Shared fixtures for myJam backend tests.
Uses SQLite in-memory so no Postgres is needed.
Firebase auth and Redis are mocked out.

Auth approach: each TestClient sends a synthetic "Bearer <uid>" token.
A single override for get_current_user reads the token and maps it to a
User loaded from the test DB — so multiple clients with different users
can coexist in one test without clobbering app.dependency_overrides.
"""
import uuid
import pytest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, get_db
from app.core.auth import get_current_user
from app.main import app
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

    def override_auth(
        credentials: HTTPAuthorizationCredentials = pytest.importorskip(
            "fastapi.security", reason="need fastapi.security"
        ) and __import__("fastapi.security", fromlist=["HTTPBearer"]).HTTPBearer(auto_error=False)(
            __import__("fastapi", fromlist=["Request"]).Request(
                {"type": "http", "headers": [], "method": "GET", "path": "/"}
            )
        ),
    ):
        pass  # placeholder — replaced below

    # Real override: look up the user whose id == the token value
    def real_override_auth(
        credentials=__import__("fastapi", fromlist=["Depends"]).Depends(
            __import__("fastapi.security", fromlist=["HTTPBearer"]).HTTPBearer(auto_error=False)
        ),
    ):
        pass

    # Simpler inline version ↓
    from fastapi import Depends
    from fastapi.security import HTTPBearer

    bearer = HTTPBearer(auto_error=False)

    def auth_from_token(creds=Depends(bearer)):
        if creds is None:
            raise HTTPException(status_code=403, detail="No credentials")
        uid = creds.credentials          # we use the uid itself as the "token"
        user = db_session.get(User, uid)
        if not user:
            raise HTTPException(status_code=403, detail=f"No user {uid}")
        return user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = auth_from_token

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

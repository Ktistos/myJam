import asyncio
import json
import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.database import get_db
from app.core.redis import get_redis
from app.models.user import User
from app.models.jam import Jam, JamAdmin, JamParticipant

router = APIRouter(prefix="/events", tags=["events"])

EVENT_TOKEN_TTL_SECONDS = 6 * 60 * 60


def _event_token_key(token: str) -> str:
    return f"event-token:{token}"


async def _store_event_token(token: str, jam_id: UUID, user_id: str) -> None:
    payload = json.dumps({"jam_id": str(jam_id), "user_id": user_id})
    await get_redis().setex(_event_token_key(token), EVENT_TOKEN_TTL_SECONDS, payload)


async def _load_event_token(token: str) -> dict[str, str] | None:
    raw = await get_redis().get(_event_token_key(token))
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


async def _consume_event_token(token: str) -> dict[str, str] | None:
    redis = get_redis()
    key = _event_token_key(token)
    if hasattr(redis, "getdel"):
        raw = await redis.getdel(key)
    else:
        raw = await redis.get(key)
        if raw:
            await redis.delete(key)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _require_access(jam: Jam, current_user: User) -> None:
    is_participant = any(p.user_id == current_user.id for p in jam.participants)
    is_admin = any(a.user_id == current_user.id for a in jam.admins)
    if not is_participant and not is_admin:
        raise HTTPException(status_code=403, detail="Access denied")


def _has_event_access(db: Session, jam_id: UUID, user_id: str) -> bool:
    jam_exists = db.query(Jam.id).filter(Jam.id == jam_id).first() is not None
    if not jam_exists:
        return False
    is_participant = db.query(JamParticipant.jam_id).filter(
        JamParticipant.jam_id == jam_id,
        JamParticipant.user_id == user_id,
    ).first() is not None
    is_admin = db.query(JamAdmin.jam_id).filter(
        JamAdmin.jam_id == jam_id,
        JamAdmin.user_id == user_id,
    ).first() is not None
    return is_participant or is_admin


@router.post("/jam/{jam_id}/token", status_code=status.HTTP_201_CREATED)
async def create_jam_event_token(
    jam_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = db.query(Jam).filter(Jam.id == jam_id).first()
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    _require_access(jam, current_user)

    token = secrets.token_urlsafe(24)
    await _store_event_token(token, jam.id, current_user.id)
    return {"token": token, "expires_in": EVENT_TOKEN_TTL_SECONDS}


@router.get("/jam/{jam_id}")
async def jam_events(
    jam_id: UUID,
    token: str | None = None,
    db: Session = Depends(get_db),
):
    """Server-Sent Events stream for a specific jam."""
    jam = db.query(Jam).filter(Jam.id == jam_id).first()
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")

    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    token_payload = await _consume_event_token(token)
    if not token_payload or token_payload.get("jam_id") != str(jam_id):
        raise HTTPException(status_code=401, detail="Invalid or expired event token")
    current_user = db.query(User).filter(User.id == token_payload.get("user_id")).first()
    if not current_user:
        raise HTTPException(status_code=401, detail="Invalid or expired event token")
    _require_access(jam, current_user)

    channel = f"jam:{jam_id}"
    user_id = current_user.id
    SessionFactory = sessionmaker(bind=db.get_bind(), autocommit=False, autoflush=False)
    db.close()

    async def stream():
        r = get_redis()
        pubsub = r.pubsub()
        await pubsub.subscribe(channel)
        try:
            while True:
                with SessionFactory() as access_db:
                    has_access = _has_event_access(access_db, jam_id, user_id)
                if not has_access:
                    break
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=25)
                if message:
                    yield f"data: {message['data']}\n\n"
                else:
                    # Heartbeat to keep the connection alive
                    yield ": heartbeat\n\n"
                await asyncio.sleep(0.1)
        finally:
            await pubsub.unsubscribe(channel)

    return StreamingResponse(stream(), media_type="text/event-stream")

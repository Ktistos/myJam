import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.redis import get_redis

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/jam/{jam_id}")
async def jam_events(jam_id: UUID):
    """Server-Sent Events stream for a specific jam."""
    channel = f"jam:{jam_id}"

    async def stream():
        r = get_redis()
        pubsub = r.pubsub()
        await pubsub.subscribe(channel)
        try:
            while True:
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

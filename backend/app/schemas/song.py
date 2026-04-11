from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class SongCreate(BaseModel):
    title: str
    artist: str = ""


class SongUpdate(BaseModel):
    title: str | None = None
    artist: str | None = None
    status: str | None = None


class SongOut(BaseModel):
    id: UUID
    jam_id: UUID
    title: str
    artist: str
    status: str
    submitted_by: str
    submitted_by_name: str
    created_at: datetime

    class Config:
        from_attributes = True


class RoleOut(BaseModel):
    id: UUID
    song_id: UUID
    instrument: str
    owner_id: str | None
    owner_name: str | None
    joined_by: str | None
    joined_by_name: str | None
    pending_user: str | None
    pending_user_name: str | None

    class Config:
        from_attributes = True

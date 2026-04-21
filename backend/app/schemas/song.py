from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class SongCreate(BaseModel):
    title: str
    artist: str = ""
    status: str | None = None


class SongImportRequest(BaseModel):
    url: str


class SongImportOut(BaseModel):
    title: str
    artist: str
    service: str
    original_url: str


class SongImportTrackOut(BaseModel):
    title: str
    artist: str


class SongPlaylistImportOut(BaseModel):
    service: str
    original_url: str
    songs: list[SongImportTrackOut]


class SongUpdate(BaseModel):
    title: str | None = None
    artist: str | None = None
    status: str | None = None


class SongOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    jam_id: UUID
    title: str
    artist: str
    status: str
    submitted_by: str
    submitted_by_name: str
    created_at: datetime


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    song_id: UUID
    instrument: str
    owner_id: str | None
    owner_name: str | None
    joined_by: str | None
    joined_by_name: str | None
    pending_user: str | None
    pending_user_name: str | None

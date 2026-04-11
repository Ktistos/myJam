from datetime import datetime
from uuid import UUID
from pydantic import BaseModel

from app.schemas.user import UserOut


class JamCreate(BaseModel):
    name: str
    date: datetime
    visibility: str = "public"
    address: str = ""
    lat: float | None = None
    lng: float | None = None
    require_role_approval: bool = False
    require_song_approval: bool = False


class JamUpdate(BaseModel):
    name: str | None = None
    date: datetime | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    state: str | None = None
    require_role_approval: bool | None = None
    require_song_approval: bool | None = None
    hardware: list[dict] | None = None
    current_song_id: UUID | None = None


class JamOut(BaseModel):
    id: UUID
    name: str
    date: datetime
    state: str
    visibility: str
    invite_code: str | None
    address: str
    lat: float | None
    lng: float | None
    require_role_approval: bool
    require_song_approval: bool
    hardware: list[dict]
    current_song_id: UUID | None
    created_by: str
    admin_ids: list[str]
    participant_count: int

    class Config:
        from_attributes = True


class ParticipantOut(BaseModel):
    user: UserOut
    joined_at: datetime

    class Config:
        from_attributes = True

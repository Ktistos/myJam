from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserOut
from app.schemas.user import MAX_INSTRUMENT_LENGTH


class JamCreate(BaseModel):
    name: str
    date: datetime
    visibility: str = "public"
    address: str = ""
    lat: float | None = None
    lng: float | None = None
    require_role_approval: bool = False
    require_song_approval: bool = False
    require_hardware_approval: bool = False


class JamUpdate(BaseModel):
    name: str | None = None
    date: datetime | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    visibility: str | None = None
    state: str | None = None
    require_role_approval: bool | None = None
    require_song_approval: bool | None = None
    require_hardware_approval: bool | None = None
    current_song_id: UUID | None = None


class HardwareOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    instrument: str
    owner_id: str
    owner_name: str
    status: str


class HardwareUpdate(BaseModel):
    instrument: str = Field(min_length=1, max_length=MAX_INSTRUMENT_LENGTH)


class JamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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
    require_hardware_approval: bool
    hardware: list[HardwareOut]
    current_song_id: UUID | None
    created_by: str
    admin_ids: list[str]
    participant_count: int
    is_participant: bool


class ParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user: UserOut
    joined_at: datetime

from pydantic import BaseModel, ConfigDict, Field

MAX_INSTRUMENT_LENGTH = 64


class InstrumentIn(BaseModel):
    instrument: str = Field(min_length=1, max_length=MAX_INSTRUMENT_LENGTH)
    skill_level: str = Field(min_length=1, max_length=32)


class InstrumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    instrument: str
    skill_level: str


class UserCreate(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=128)
    bio: str = ""
    recording_link: str = ""
    avatar_url: str = ""
    instruments: list[InstrumentIn] = Field(default_factory=list)


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    bio: str | None = None
    recording_link: str | None = None
    avatar_url: str | None = None
    instruments: list[InstrumentIn] | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    bio: str
    recording_link: str
    avatar_url: str
    instruments: list[InstrumentOut]

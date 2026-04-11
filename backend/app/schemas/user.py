from pydantic import BaseModel


class InstrumentIn(BaseModel):
    instrument: str
    skill_level: str


class InstrumentOut(BaseModel):
    instrument: str
    skill_level: str

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    id: str
    name: str
    bio: str = ""
    recording_link: str = ""
    avatar_url: str = ""
    instruments: list[InstrumentIn] = []


class UserUpdate(BaseModel):
    name: str | None = None
    bio: str | None = None
    recording_link: str | None = None
    avatar_url: str | None = None
    instruments: list[InstrumentIn] | None = None


class UserOut(BaseModel):
    id: str
    name: str
    bio: str
    recording_link: str
    avatar_url: str
    instruments: list[InstrumentOut]

    class Config:
        from_attributes = True

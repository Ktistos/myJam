from datetime import datetime

from pydantic import BaseModel


class SpotifyLoginOut(BaseModel):
    url: str


class SpotifyStatusOut(BaseModel):
    connected: bool
    expires_at: datetime | None = None
    scope: str | None = None

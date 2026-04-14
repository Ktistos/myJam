from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id             = Column(String, primary_key=True)   # Firebase UID
    name           = Column(String, nullable=False)
    bio            = Column(String, default="")
    recording_link = Column(String, default="")
    avatar_url     = Column(String, default="")
    created_at     = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    instruments    = relationship("UserInstrument", back_populates="user", cascade="all, delete-orphan")
    spotify_connection = relationship(
        "SpotifyConnection",
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False,
    )
    jam_admins     = relationship("JamAdmin",       back_populates="user")
    participations = relationship("JamParticipant", back_populates="user")


class UserInstrument(Base):
    __tablename__ = "user_instruments"

    user_id     = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    instrument  = Column(String, primary_key=True)
    skill_level = Column(String, nullable=False)

    user = relationship("User", back_populates="instruments")


class SpotifyConnection(Base):
    __tablename__ = "spotify_connections"

    user_id       = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    access_token  = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=False)
    scope         = Column(String, default="")
    expires_at    = Column(DateTime(timezone=True), nullable=False)
    created_at    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at    = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="spotify_connection")

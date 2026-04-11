from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey
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
    jam_admins     = relationship("JamAdmin",       back_populates="user")
    participations = relationship("JamParticipant", back_populates="user")


class UserInstrument(Base):
    __tablename__ = "user_instruments"

    user_id     = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    instrument  = Column(String, primary_key=True)
    skill_level = Column(String, nullable=False)

    user = relationship("User", back_populates="instruments")

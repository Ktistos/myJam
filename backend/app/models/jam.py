import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Boolean, Float, ForeignKey, UUID, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base


class Jam(Base):
    __tablename__ = "jams"

    id                        = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name                      = Column(String, nullable=False)
    date                      = Column(DateTime(timezone=True), nullable=False)
    state                     = Column(String, default="initial")   # initial|tuning|in-progress|completed
    visibility                = Column(String, default="public")    # public|private
    invite_code               = Column(String, unique=True, nullable=True)
    address                   = Column(String, default="")
    lat                       = Column(Float, nullable=True)
    lng                       = Column(Float, nullable=True)
    require_role_approval     = Column(Boolean, default=False)
    require_song_approval     = Column(Boolean, default=False)
    require_hardware_approval = Column(Boolean, default=False)
    current_song_id           = Column(UUID(as_uuid=True), ForeignKey("songs.id", use_alter=True), nullable=True)
    created_by                = Column(String, ForeignKey("users.id"), nullable=False)
    created_at                = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    admins       = relationship("JamAdmin",       back_populates="jam", cascade="all, delete-orphan")
    participants = relationship("JamParticipant", back_populates="jam", cascade="all, delete-orphan")
    hardware     = relationship("JamHardware",    back_populates="jam", cascade="all, delete-orphan")
    songs        = relationship("Song", back_populates="jam", cascade="all, delete-orphan",
                                foreign_keys="Song.jam_id")
    current_song = relationship("Song", foreign_keys=[current_song_id], post_update=True)


class JamAdmin(Base):
    __tablename__ = "jam_admins"

    jam_id  = Column(UUID(as_uuid=True), ForeignKey("jams.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)

    jam  = relationship("Jam",  back_populates="admins")
    user = relationship("User", back_populates="jam_admins")


class JamParticipant(Base):
    __tablename__ = "jam_participants"

    jam_id    = Column(UUID(as_uuid=True), ForeignKey("jams.id", ondelete="CASCADE"), primary_key=True)
    user_id   = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    joined_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    jam  = relationship("Jam",  back_populates="participants")
    user = relationship("User", back_populates="participations")


class JamHardware(Base):
    __tablename__ = "jam_hardware"
    __table_args__ = (
        UniqueConstraint("jam_id", "instrument", "owner_id", name="uq_jam_hardware_item"),
    )

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jam_id     = Column(UUID(as_uuid=True), ForeignKey("jams.id", ondelete="CASCADE"), nullable=False)
    instrument = Column(String, nullable=False)
    owner_id   = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status     = Column(String, default="approved")  # pending|approved
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    jam   = relationship("Jam",  back_populates="hardware")
    owner = relationship("User", foreign_keys=[owner_id])

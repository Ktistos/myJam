import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class Song(Base):
    __tablename__ = "songs"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jam_id       = Column(UUID(as_uuid=True), ForeignKey("jams.id", ondelete="CASCADE"), nullable=False)
    title        = Column(String, nullable=False)
    artist       = Column(String, default="")
    status       = Column(String, default="approved")  # pending|approved
    submitted_by = Column(String, ForeignKey("users.id"), nullable=False)
    created_at   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    jam        = relationship("Jam",  back_populates="songs", foreign_keys=[jam_id])
    submitter  = relationship("User", foreign_keys=[submitted_by])
    roles      = relationship("Role", back_populates="song", cascade="all, delete-orphan")


class Role(Base):
    __tablename__ = "roles"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    song_id     = Column(UUID(as_uuid=True), ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    instrument  = Column(String, nullable=False)
    owner_id    = Column(String, ForeignKey("users.id"), nullable=True)
    joined_by   = Column(String, ForeignKey("users.id"), nullable=True)
    pending_user = Column(String, ForeignKey("users.id"), nullable=True)

    song         = relationship("Song", back_populates="roles")
    owner        = relationship("User", foreign_keys=[owner_id])
    joined_user  = relationship("User", foreign_keys=[joined_by])
    pending      = relationship("User", foreign_keys=[pending_user])

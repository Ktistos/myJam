import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.redis import publish
from app.models.user import User
from app.models.jam import Jam, JamParticipant
from app.models.song import Song, Role
from app.schemas.song import SongCreate, SongUpdate, SongOut, RoleOut

router = APIRouter(prefix="/songs", tags=["songs"])


def _song_out(song: Song) -> SongOut:
    return SongOut(
        id=song.id,
        jam_id=song.jam_id,
        title=song.title,
        artist=song.artist,
        status=song.status,
        submitted_by=song.submitted_by,
        submitted_by_name=song.submitter.name if song.submitter else "",
        created_at=song.created_at,
    )


def _role_out(role: Role) -> RoleOut:
    return RoleOut(
        id=role.id,
        song_id=role.song_id,
        instrument=role.instrument,
        owner_id=role.owner_id,
        owner_name=role.owner.name if role.owner else None,
        joined_by=role.joined_by,
        joined_by_name=role.joined_user.name if role.joined_user else None,
        pending_user=role.pending_user,
        pending_user_name=role.pending.name if role.pending else None,
    )


# ── Songs for a jam ───────────────────────────────────────────────────────────

@router.get("/jam/{jam_id}", response_model=list[SongOut])
def list_songs(jam_id: UUID, db: Session = Depends(get_db)):
    songs = db.query(Song).filter(Song.jam_id == jam_id).all()
    return [_song_out(s) for s in songs]


@router.post("/jam/{jam_id}", response_model=SongOut, status_code=status.HTTP_201_CREATED)
async def submit_song(
    jam_id: UUID,
    body: SongCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = db.query(Jam).filter(Jam.id == jam_id).first()
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")

    is_participant = db.query(JamParticipant).filter(
        JamParticipant.jam_id == jam_id,
        JamParticipant.user_id == current_user.id,
    ).first()
    if not is_participant:
        raise HTTPException(status_code=403, detail="Must be a participant to submit songs")

    song_status = "pending" if jam.require_song_approval else "approved"
    song = Song(jam_id=jam_id, title=body.title, artist=body.artist,
                status=song_status, submitted_by=current_user.id)
    db.add(song)
    db.flush()

    # Auto-create roles from Jam's hardware set
    if jam.hardware:
        for item in jam.hardware:
            db.add(Role(song_id=song.id, instrument=item.get("instrument"), owner_id=item.get("owner_id")))

    db.commit()
    db.refresh(song)
    await publish(f"jam:{jam_id}", json.dumps({"type": "song_added", "song_id": str(song.id)}))
    return _song_out(song)


# ── Single song ───────────────────────────────────────────────────────────────

@router.patch("/{song_id}", response_model=SongOut)
def update_song(
    song_id: UUID,
    body: SongUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    jam = db.query(Jam).filter(Jam.id == song.jam_id).first()
    is_admin = any(a.user_id == current_user.id for a in jam.admins)
    if not is_admin and song.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    if body.title is not None:
        song.title = body.title
    if body.artist is not None:
        song.artist = body.artist
    if body.status is not None:
        is_admin or (_ for _ in ()).throw(HTTPException(status_code=403, detail="Admin only"))
        song.status = body.status
    db.commit()
    db.refresh(song)
    return _song_out(song)


@router.delete("/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_song(
    song_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    jam = db.query(Jam).filter(Jam.id == song.jam_id).first()
    is_admin = any(a.user_id == current_user.id for a in jam.admins)
    if not is_admin and song.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    db.delete(song)
    db.commit()


# ── Roles ─────────────────────────────────────────────────────────────────────

@router.get("/{song_id}/roles", response_model=list[RoleOut])
def list_roles(song_id: UUID, db: Session = Depends(get_db)):
    roles = db.query(Role).filter(Role.song_id == song_id).all()
    return [_role_out(r) for r in roles]


@router.post("/roles/{role_id}/claim", response_model=RoleOut)
async def claim_role(
    role_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.joined_by or role.pending_user:
        raise HTTPException(status_code=409, detail="Role already taken or pending")

    song = db.query(Song).filter(Song.id == role.song_id).first()
    jam = db.query(Jam).filter(Jam.id == song.jam_id).first()

    if jam.require_role_approval:
        role.pending_user = current_user.id
    else:
        role.joined_by = current_user.id

    db.commit()
    db.refresh(role)
    await publish(f"jam:{jam.id}", json.dumps({"type": "role_updated", "role_id": str(role_id)}))
    return _role_out(role)


@router.post("/roles/{role_id}/leave", response_model=RoleOut)
async def leave_role(
    role_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if role.joined_by == current_user.id:
        role.joined_by = None
    elif role.pending_user == current_user.id:
        role.pending_user = None
    else:
        raise HTTPException(status_code=403, detail="You are not in this role")

    db.commit()
    db.refresh(role)
    song = db.query(Song).filter(Song.id == role.song_id).first()
    await publish(f"jam:{song.jam_id}", json.dumps({"type": "role_updated", "role_id": str(role_id)}))
    return _role_out(role)


@router.patch("/roles/{role_id}/approve", response_model=RoleOut)
async def approve_role(
    role_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    song = db.query(Song).filter(Song.id == role.song_id).first()
    jam = db.query(Jam).filter(Jam.id == song.jam_id).first()
    if not any(a.user_id == current_user.id for a in jam.admins):
        raise HTTPException(status_code=403, detail="Admin only")

    role.joined_by = role.pending_user
    role.pending_user = None
    db.commit()
    db.refresh(role)
    await publish(f"jam:{jam.id}", json.dumps({"type": "role_updated", "role_id": str(role_id)}))
    return _role_out(role)


@router.patch("/roles/{role_id}/reject", response_model=RoleOut)
def reject_role(
    role_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    song = db.query(Song).filter(Song.id == role.song_id).first()
    jam = db.query(Jam).filter(Jam.id == song.jam_id).first()
    if not any(a.user_id == current_user.id for a in jam.admins):
        raise HTTPException(status_code=403, detail="Admin only")

    role.pending_user = None
    db.commit()
    db.refresh(role)
    return _role_out(role)

import json
import random
import string
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.redis import publish
from app.models.user import User
from app.models.jam import Jam, JamAdmin, JamParticipant
from app.schemas.jam import JamCreate, JamUpdate, JamOut, ParticipantOut

router = APIRouter(prefix="/jams", tags=["jams"])


def _jam_out(jam: Jam) -> JamOut:
    return JamOut(
        id=jam.id,
        name=jam.name,
        date=jam.date,
        state=jam.state,
        visibility=jam.visibility,
        invite_code=jam.invite_code,
        address=jam.address,
        lat=jam.lat,
        lng=jam.lng,
        require_role_approval=jam.require_role_approval,
        require_song_approval=jam.require_song_approval,
        hardware=jam.hardware or [],
        current_song_id=jam.current_song_id,
        created_by=jam.created_by,
        admin_ids=[a.user_id for a in jam.admins],
        participant_count=len(jam.participants),
    )


def _rand_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


def _require_admin(jam: Jam, user: User) -> None:
    if not any(a.user_id == user.id for a in jam.admins):
        raise HTTPException(status_code=403, detail="Admin only")


# ── List / Create ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[JamOut])
def list_jams(db: Session = Depends(get_db)):
    jams = db.query(Jam).filter(Jam.visibility == "public").all()
    return [_jam_out(j) for j in jams]


@router.post("", response_model=JamOut, status_code=status.HTTP_201_CREATED)
def create_jam(
    body: JamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invite_code = _rand_code() if body.visibility == "private" else None
    jam = Jam(
        name=body.name,
        date=body.date,
        visibility=body.visibility,
        invite_code=invite_code,
        address=body.address,
        lat=body.lat,
        lng=body.lng,
        require_role_approval=body.require_role_approval,
        require_song_approval=body.require_song_approval,
        created_by=current_user.id,
    )
    db.add(jam)
    db.flush()
    db.add(JamAdmin(jam_id=jam.id, user_id=current_user.id))
    db.add(JamParticipant(jam_id=jam.id, user_id=current_user.id))
    db.commit()
    db.refresh(jam)
    return _jam_out(jam)


# ── Single jam ────────────────────────────────────────────────────────────────

@router.get("/{jam_id}", response_model=JamOut)
def get_jam(jam_id: UUID, db: Session = Depends(get_db)):
    jam = db.query(Jam).filter(Jam.id == jam_id).first()
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    return _jam_out(jam)


@router.patch("/{jam_id}", response_model=JamOut)
async def update_jam(
    jam_id: UUID,
    body: JamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = db.query(Jam).filter(Jam.id == jam_id).first()
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    _require_admin(jam, current_user)

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(jam, field, value)
    db.commit()
    db.refresh(jam)

    await publish(f"jam:{jam_id}", json.dumps({"type": "jam_updated", "jam": str(jam_id)}))
    return _jam_out(jam)


@router.delete("/{jam_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_jam(
    jam_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = db.query(Jam).filter(Jam.id == jam_id).first()
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    _require_admin(jam, current_user)
    db.delete(jam)
    db.commit()


# ── Invite code ───────────────────────────────────────────────────────────────

@router.get("/invite/{code}", response_model=JamOut)
def get_jam_by_invite(code: str, db: Session = Depends(get_db)):
    jam = db.query(Jam).filter(Jam.invite_code == code.upper()).first()
    if not jam:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    return _jam_out(jam)


# ── Participants ──────────────────────────────────────────────────────────────

@router.get("/{jam_id}/participants", response_model=list[ParticipantOut])
def list_participants(jam_id: UUID, db: Session = Depends(get_db)):
    jam = db.query(Jam).filter(Jam.id == jam_id).first()
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    return jam.participants


@router.post("/{jam_id}/join", status_code=status.HTTP_201_CREATED)
async def join_jam(
    jam_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = db.query(Jam).filter(Jam.id == jam_id).first()
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    if any(p.user_id == current_user.id for p in jam.participants):
        raise HTTPException(status_code=409, detail="Already a participant")

    db.add(JamParticipant(jam_id=jam_id, user_id=current_user.id))
    db.commit()
    await publish(f"jam:{jam_id}", json.dumps({"type": "participant_joined", "user_id": current_user.id}))
    return {"detail": "Joined"}


@router.post("/{jam_id}/leave", status_code=status.HTTP_200_OK)
async def leave_jam(
    jam_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(JamParticipant).filter(
        JamParticipant.jam_id == jam_id,
        JamParticipant.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not a participant")
    db.delete(row)
    db.commit()
    return {"detail": "Left"}


@router.post("/{jam_id}/hardware", response_model=JamOut)
async def add_jam_hardware(
    jam_id: UUID,
    instrument: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = db.query(Jam).filter(Jam.id == jam_id).first()
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    
    is_participant = any(p.user_id == current_user.id for p in jam.participants)
    is_admin = any(a.user_id == current_user.id for a in jam.admins)
    
    if not is_participant and not is_admin:
        raise HTTPException(status_code=403, detail="Must be a participant to add hardware")

    # Update hardware list
    new_hardware = list(jam.hardware or [])
    new_item = {"instrument": instrument, "owner_id": current_user.id}
    new_hardware.append(new_item)
    jam.hardware = new_hardware
    
    # Also create roles for this new instrument in all existing songs
    from app.models.song import Song, Role
    songs = db.query(Song).filter(Song.jam_id == jam_id).all()
    for song in songs:
        db.add(Role(song_id=song.id, instrument=instrument, owner_id=current_user.id))
    
    db.commit()
    db.refresh(jam)
    
    await publish(f"jam:{jam_id}", json.dumps({"type": "jam_updated", "jam": str(jam_id)}))
    return _jam_out(jam)


# ── Admins ────────────────────────────────────────────────────────────────────

@router.post("/{jam_id}/admins/{user_id}", status_code=status.HTTP_201_CREATED)
def add_admin(
    jam_id: UUID,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = db.query(Jam).filter(Jam.id == jam_id).first()
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    _require_admin(jam, current_user)
    if any(a.user_id == user_id for a in jam.admins):
        raise HTTPException(status_code=409, detail="Already an admin")
    db.add(JamAdmin(jam_id=jam_id, user_id=user_id))
    db.commit()
    return {"detail": "Admin added"}


@router.delete("/{jam_id}/admins/{user_id}", status_code=status.HTTP_200_OK)
def remove_admin(
    jam_id: UUID,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = db.query(Jam).filter(Jam.id == jam_id).first()
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    _require_admin(jam, current_user)
    if len(jam.admins) <= 1:
        raise HTTPException(status_code=400, detail="Cannot remove the last admin")
    row = db.query(JamAdmin).filter(JamAdmin.jam_id == jam_id, JamAdmin.user_id == user_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Admin not found")
    db.delete(row)
    db.commit()
    return {"detail": "Admin removed"}

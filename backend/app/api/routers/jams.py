import json
import secrets
import string
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user, get_optional_current_user
from app.core.redis import publish
from app.models.user import User
from app.models.jam import Jam, JamAdmin, JamParticipant, JamHardware
from app.models.song import Song, Role
from app.schemas.jam import JamCreate, JamUpdate, JamOut, HardwareOut, HardwareUpdate, ParticipantOut
from app.schemas.user import MAX_INSTRUMENT_LENGTH

router = APIRouter(prefix="/jams", tags=["jams"])

INVITE_CODE_LENGTH = 6
INVITE_CODE_ALPHABET = string.ascii_uppercase + string.digits
INVITE_CODE_GENERATION_ATTEMPTS = 32
VALID_VISIBILITIES = {"public", "private"}
VALID_JAM_STATES = {"initial", "tuning", "in-progress", "completed"}


def _hardware_out(hw: JamHardware) -> HardwareOut:
    return HardwareOut(
        id=hw.id,
        instrument=hw.instrument,
        owner_id=hw.owner_id,
        owner_name=hw.owner.name if hw.owner else hw.owner_id,
        status=hw.status,
    )


def _jam_out(jam: Jam, user: User | None = None) -> JamOut:
    is_admin = user is not None and _is_admin(jam, user.id)
    return JamOut(
        id=jam.id,
        name=jam.name,
        date=jam.date,
        state=jam.state,
        visibility=jam.visibility,
        invite_code=jam.invite_code if is_admin else None,
        address=jam.address,
        lat=jam.lat,
        lng=jam.lng,
        require_role_approval=jam.require_role_approval,
        require_song_approval=jam.require_song_approval,
        require_hardware_approval=jam.require_hardware_approval,
        hardware=[_hardware_out(hw) for hw in jam.hardware],
        current_song_id=jam.current_song_id,
        created_by=jam.created_by,
        admin_ids=[a.user_id for a in jam.admins],
        participant_count=len(jam.participants),
        is_participant=user is not None and _is_participant(jam, user.id),
    )


def _rand_code(length: int = 6) -> str:
    return "".join(secrets.choice(INVITE_CODE_ALPHABET) for _ in range(length))


def _normalize_invite_code(code: str) -> str:
    return "".join(ch for ch in code.strip().upper() if ch.isalnum())


def _generate_unique_invite_code(db: Session) -> str:
    for _ in range(INVITE_CODE_GENERATION_ATTEMPTS):
        code = _rand_code(INVITE_CODE_LENGTH)
        if not db.query(Jam.id).filter(Jam.invite_code == code).first():
            return code
    raise HTTPException(status_code=503, detail="Could not generate invite code")


def _normalize_visibility(visibility: str) -> str:
    normalized = visibility.strip().lower()
    if normalized not in VALID_VISIBILITIES:
        raise HTTPException(status_code=400, detail="Visibility must be public or private")
    return normalized


def _normalize_required_text(value: str, field_name: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    return normalized


def _normalize_jam_state(state: str) -> str:
    normalized = state.strip().lower()
    if normalized not in VALID_JAM_STATES:
        raise HTTPException(status_code=400, detail="Jam state is invalid")
    return normalized


def _get_locked_jam(db: Session, jam_id: UUID) -> Jam | None:
    return db.query(Jam).filter(Jam.id == jam_id).with_for_update().first()


def _get_locked_admin_row(db: Session, jam_id: UUID, user_id: str) -> JamAdmin | None:
    return db.query(JamAdmin).filter(
        JamAdmin.jam_id == jam_id,
        JamAdmin.user_id == user_id,
    ).with_for_update().first()


def _get_locked_participant_row(db: Session, jam_id: UUID, user_id: str) -> JamParticipant | None:
    return db.query(JamParticipant).filter(
        JamParticipant.jam_id == jam_id,
        JamParticipant.user_id == user_id,
    ).with_for_update().first()


def _require_admin(jam: Jam, user: User) -> None:
    if not _is_admin(jam, user.id):
        raise HTTPException(status_code=403, detail="Admin only")


def _is_participant(jam: Jam, user_id: str) -> bool:
    return any(p.user_id == user_id for p in jam.participants)


def _is_admin(jam: Jam, user_id: str) -> bool:
    return any(a.user_id == user_id for a in jam.admins)


def _has_access(jam: Jam, user: User | None) -> bool:
    if jam.visibility == "public":
        return True
    if user is None:
        return False
    return _is_participant(jam, user.id) or _is_admin(jam, user.id)


def _require_access(jam: Jam, user: User | None) -> None:
    if not _has_access(jam, user):
        raise HTTPException(status_code=403, detail="Access denied")


def _delete_orphan_jam(db: Session, jam: Jam | None) -> Jam | None:
    if jam is None:
        return None
    if jam.admins:
        return jam
    db.delete(jam)
    db.commit()
    return None


def _prune_orphan_jams(db: Session, jams: list[Jam]) -> list[Jam]:
    orphan_jams = [jam for jam in jams if not jam.admins]
    if orphan_jams:
        for jam in orphan_jams:
            db.delete(jam)
        db.commit()
    return [jam for jam in jams if jam.admins]


# ── List / Create ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[JamOut])
def list_jams(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    query = db.query(Jam)
    if current_user is None:
        jams = query.filter(Jam.visibility == "public").all()
    else:
        jams = query.filter(
            or_(
                Jam.visibility == "public",
                Jam.created_by == current_user.id,
                Jam.admins.any(JamAdmin.user_id == current_user.id),
                Jam.participants.any(JamParticipant.user_id == current_user.id),
            )
        ).all()
    jams = _prune_orphan_jams(db, jams)
    return [_jam_out(j, current_user) for j in jams]


@router.post("", response_model=JamOut, status_code=status.HTTP_201_CREATED)
def create_jam(
    body: JamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    visibility = _normalize_visibility(body.visibility)
    attempts = INVITE_CODE_GENERATION_ATTEMPTS if visibility == "private" else 1

    for _ in range(attempts):
        jam = Jam(
            name=_normalize_required_text(body.name, "Jam name"),
            date=body.date,
            visibility=visibility,
            invite_code=_generate_unique_invite_code(db) if visibility == "private" else None,
            address=body.address,
            lat=body.lat,
            lng=body.lng,
            require_role_approval=body.require_role_approval,
            require_song_approval=body.require_song_approval,
            require_hardware_approval=body.require_hardware_approval,
            created_by=current_user.id,
        )
        db.add(jam)
        try:
            db.flush()
            db.add(JamAdmin(jam_id=jam.id, user_id=current_user.id))
            db.add(JamParticipant(jam_id=jam.id, user_id=current_user.id))
            db.commit()
        except IntegrityError:
            db.rollback()
            if visibility == "private":
                continue
            raise

        db.refresh(jam)
        return _jam_out(jam, current_user)

    raise HTTPException(status_code=503, detail="Could not generate invite code")


# ── Single jam ────────────────────────────────────────────────────────────────

@router.get("/{jam_id}", response_model=JamOut)
def get_jam(
    jam_id: UUID,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    jam = _delete_orphan_jam(db, db.query(Jam).filter(Jam.id == jam_id).first())
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    _require_access(jam, current_user)
    return _jam_out(jam, current_user)


@router.patch("/{jam_id}", response_model=JamOut)
async def update_jam(
    jam_id: UUID,
    body: JamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = _get_locked_jam(db, jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    if not _get_locked_admin_row(db, jam_id, current_user.id):
        raise HTTPException(status_code=403, detail="Admin only")

    updates = body.model_dump(exclude_unset=True)
    if "visibility" in updates:
        if updates["visibility"] is None:
            raise HTTPException(status_code=400, detail="Visibility is required")
        visibility = _normalize_visibility(updates.pop("visibility"))
        if visibility != jam.visibility:
            jam.visibility = visibility
            jam.invite_code = _generate_unique_invite_code(db) if visibility == "private" else None

    if "name" in updates:
        if updates["name"] is None:
            raise HTTPException(status_code=400, detail="Jam name is required")
        updates["name"] = _normalize_required_text(updates["name"], "Jam name")

    if "state" in updates:
        if updates["state"] is None:
            raise HTTPException(status_code=400, detail="Jam state is required")
        updates["state"] = _normalize_jam_state(updates["state"])

    if "date" in updates and updates["date"] is None:
        raise HTTPException(status_code=400, detail="Date is required")

    if "current_song_id" in updates:
        current_song_id = updates.pop("current_song_id")
        if current_song_id is None:
            jam.current_song_id = None
        else:
            current_song = db.query(Song).filter(Song.id == current_song_id).with_for_update().first()
            if not current_song or current_song.jam_id != jam_id:
                raise HTTPException(status_code=400, detail="Current song must belong to this jam")
            if current_song.status != "approved":
                raise HTTPException(status_code=400, detail="Current song must be approved")
            jam.current_song_id = current_song_id

    for field, value in updates.items():
        setattr(jam, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Invite code already exists")
    db.refresh(jam)

    await publish(f"jam:{jam_id}", json.dumps({"type": "jam_updated", "jam": str(jam_id)}))
    return _jam_out(jam, current_user)


@router.delete("/{jam_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_jam(
    jam_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = _get_locked_jam(db, jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    if not _get_locked_admin_row(db, jam_id, current_user.id):
        raise HTTPException(status_code=403, detail="Admin only")
    db.delete(jam)
    db.commit()
    await publish(f"jam:{jam_id}", json.dumps({"type": "jam_deleted", "jam": str(jam_id)}))


# ── Invite code ───────────────────────────────────────────────────────────────

@router.get("/invite/{code:path}", response_model=JamOut)
def get_jam_by_invite(
    code: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    normalized_code = _normalize_invite_code(code)
    jam = _delete_orphan_jam(db, db.query(Jam).filter(Jam.invite_code == normalized_code).first())
    if not jam:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    return _jam_out(jam, current_user)


@router.post("/{jam_id}/invite-code", response_model=JamOut)
async def regenerate_invite_code(
    jam_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = _get_locked_jam(db, jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    if not _get_locked_admin_row(db, jam_id, current_user.id):
        raise HTTPException(status_code=403, detail="Admin only")
    if jam.visibility != "private":
        raise HTTPException(status_code=400, detail="Only private jams have invite codes")

    old_code = jam.invite_code
    attempts = INVITE_CODE_GENERATION_ATTEMPTS
    for _ in range(attempts):
        new_code = _generate_unique_invite_code(db)
        if new_code == old_code:
            continue
        jam.invite_code = new_code
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            jam = _get_locked_jam(db, jam_id)
            if not jam:
                raise HTTPException(status_code=404, detail="Jam not found")
            continue

        db.refresh(jam)
        await publish(f"jam:{jam_id}", json.dumps({"type": "jam_updated", "jam": str(jam_id)}))
        return _jam_out(jam, current_user)

    raise HTTPException(status_code=503, detail="Could not generate invite code")


# ── Participants ──────────────────────────────────────────────────────────────

@router.get("/{jam_id}/participants", response_model=list[ParticipantOut])
def list_participants(
    jam_id: UUID,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    jam = _delete_orphan_jam(db, db.query(Jam).filter(Jam.id == jam_id).first())
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    _require_access(jam, current_user)
    return jam.participants


@router.post("/{jam_id}/join", status_code=status.HTTP_201_CREATED)
async def join_jam(
    jam_id: UUID,
    invite_code: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = _get_locked_jam(db, jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    if jam.visibility == "private":
        if not invite_code or _normalize_invite_code(invite_code) != jam.invite_code:
            raise HTTPException(status_code=403, detail="Valid invite code required")
    if any(p.user_id == current_user.id for p in jam.participants):
        raise HTTPException(status_code=409, detail="Already a participant")

    db.add(JamParticipant(jam_id=jam_id, user_id=current_user.id))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        duplicate = db.query(JamParticipant).filter(
            JamParticipant.jam_id == jam_id,
            JamParticipant.user_id == current_user.id,
        ).first()
        if duplicate:
            raise HTTPException(status_code=409, detail="Already a participant")
        raise
    await publish(f"jam:{jam_id}", json.dumps({"type": "participant_joined", "user_id": current_user.id}))
    return {"detail": "Joined"}


@router.post("/{jam_id}/leave", status_code=status.HTTP_200_OK)
async def leave_jam(
    jam_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = _get_locked_jam(db, jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")

    participant_row = db.query(JamParticipant).filter(
        JamParticipant.jam_id == jam_id,
        JamParticipant.user_id == current_user.id,
    ).with_for_update().first()
    admin_rows = db.query(JamAdmin).filter(
        JamAdmin.jam_id == jam_id,
    ).with_for_update().all()
    admin_row = next((row for row in admin_rows if row.user_id == current_user.id), None)

    if not participant_row and not admin_row:
        raise HTTPException(status_code=404, detail="Not a participant")

    is_last_admin = admin_row is not None and len(admin_rows) == 1
    if is_last_admin:
        db.delete(jam)
        db.commit()
        await publish(f"jam:{jam_id}", json.dumps({"type": "jam_deleted", "jam": str(jam_id)}))
        return {"detail": "Jam deleted", "deleted_jam": True}

    if participant_row:
        db.delete(participant_row)
    if admin_row:
        db.delete(admin_row)
    db.commit()
    await publish(
        f"jam:{jam_id}",
        json.dumps(
            {
                "type": "participant_left",
                "user_id": current_user.id,
                "was_admin": admin_row is not None,
            }
        ),
    )
    if admin_row is not None:
        await publish(f"jam:{jam_id}", json.dumps({"type": "jam_updated", "jam": str(jam_id)}))
    return {"detail": "Left", "deleted_jam": False}


def _cleanup_removed_participant_resources(db: Session, jam_id: UUID, user_id: str) -> tuple[bool, bool]:
    removed_hardware = False
    changed_roles = False

    hardware_items = db.query(JamHardware).filter(
        JamHardware.jam_id == jam_id,
        JamHardware.owner_id == user_id,
    ).with_for_update().all()
    for hw in hardware_items:
        db.delete(hw)
        removed_hardware = True

    roles = db.query(Role).join(Song, Role.song_id == Song.id).filter(
        Song.jam_id == jam_id,
    ).with_for_update(of=Role).all()
    for role in roles:
        if role.owner_id == user_id:
            db.delete(role)
            changed_roles = True
            continue
        if role.joined_by == user_id:
            role.joined_by = None
            changed_roles = True
        if role.pending_user == user_id:
            role.pending_user = None
            changed_roles = True

    return removed_hardware, changed_roles


@router.delete("/{jam_id}/participants/{user_id}", status_code=status.HTTP_200_OK)
async def remove_participant(
    jam_id: UUID,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = _get_locked_jam(db, jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    if not _get_locked_admin_row(db, jam_id, current_user.id):
        raise HTTPException(status_code=403, detail="Admin only")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Use leave jam to remove yourself")

    participant_row = _get_locked_participant_row(db, jam_id, user_id)
    admin_rows = db.query(JamAdmin).filter(JamAdmin.jam_id == jam_id).with_for_update().all()
    admin_row = next((row for row in admin_rows if row.user_id == user_id), None)
    if not participant_row and not admin_row:
        raise HTTPException(status_code=404, detail="Participant not found")
    if admin_row is not None and len(admin_rows) <= 1:
        raise HTTPException(status_code=400, detail="Cannot remove the last admin")

    removed_hardware, changed_roles = _cleanup_removed_participant_resources(db, jam_id, user_id)
    if participant_row:
        db.delete(participant_row)
    if admin_row:
        db.delete(admin_row)

    db.commit()
    await publish(
        f"jam:{jam_id}",
        json.dumps(
            {
                "type": "participant_left",
                "user_id": user_id,
                "was_admin": admin_row is not None,
                "removed_by_admin": True,
            }
        ),
    )
    if admin_row is not None:
        await publish(f"jam:{jam_id}", json.dumps({"type": "jam_updated", "jam": str(jam_id)}))
    if removed_hardware:
        await publish(f"jam:{jam_id}", json.dumps({"type": "hardware_updated", "jam": str(jam_id)}))
    if changed_roles:
        await publish(f"jam:{jam_id}", json.dumps({"type": "role_updated", "jam": str(jam_id)}))
    return {
        "detail": "Participant removed",
        "removed_admin": admin_row is not None,
        "removed_hardware": removed_hardware,
        "changed_roles": changed_roles,
    }


def _create_roles_for_hardware(db: Session, jam_id: UUID, instrument: str, owner_id: str) -> None:
    """Create roles in all existing songs for a newly-approved hardware item."""
    songs = db.query(Song).filter(Song.jam_id == jam_id).all()
    if not songs:
        return
    existing_roles = {
        role.song_id
        for role in db.query(Role).filter(
            Role.song_id.in_([s.id for s in songs]),
            func.lower(Role.instrument) == instrument.lower(),
            Role.owner_id == owner_id,
        ).all()
    }
    for song in songs:
        if song.id not in existing_roles:
            db.add(Role(song_id=song.id, instrument=instrument, owner_id=owner_id))


def _roles_for_hardware(db: Session, jam_id: UUID, instrument: str, owner_id: str) -> list[Role]:
    return db.query(Role).join(Song, Role.song_id == Song.id).filter(
        Song.jam_id == jam_id,
        Role.instrument == instrument,
        Role.owner_id == owner_id,
    ).with_for_update(of=Role).all()


def _rename_roles_for_hardware(
    db: Session,
    jam_id: UUID,
    old_instrument: str,
    new_instrument: str,
    owner_id: str,
) -> None:
    if old_instrument == new_instrument:
        return

    old_roles = _roles_for_hardware(db, jam_id, old_instrument, owner_id)
    for role in old_roles:
        existing_new_role = db.query(Role).filter(
            Role.song_id == role.song_id,
            func.lower(Role.instrument) == new_instrument.lower(),
            Role.owner_id == owner_id,
        ).with_for_update().first()
        if existing_new_role and existing_new_role.id != role.id:
            raise HTTPException(status_code=409, detail="Role already exists for updated hardware")

    for role in old_roles:
        role.instrument = new_instrument


def _delete_unclaimed_roles_for_hardware(
    db: Session,
    jam_id: UUID,
    instrument: str,
    owner_id: str,
) -> None:
    for role in _roles_for_hardware(db, jam_id, instrument, owner_id):
        if role.joined_by is None and role.pending_user is None:
            db.delete(role)


def _normalize_hardware_instrument(instrument: str) -> str:
    normalized = instrument.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="Instrument is required")
    if len(normalized) > MAX_INSTRUMENT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Instrument must be {MAX_INSTRUMENT_LENGTH} characters or fewer",
        )
    if normalized.casefold() == "vocals":
        raise HTTPException(
            status_code=400,
            detail="Vocals are always available as a role and cannot be added as hardware",
        )
    return normalized


@router.get("/{jam_id}/hardware", response_model=list[HardwareOut])
def list_hardware(
    jam_id: UUID,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    jam = db.query(Jam).filter(Jam.id == jam_id).first()
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    _require_access(jam, current_user)
    is_admin = current_user is not None and any(a.user_id == current_user.id for a in jam.admins)
    items = jam.hardware
    if not is_admin:
        items = [
            hw for hw in items
            if hw.status == "approved" or (current_user and hw.owner_id == current_user.id)
        ]
    return [_hardware_out(hw) for hw in items]


@router.post("/{jam_id}/hardware", response_model=HardwareOut, status_code=status.HTTP_201_CREATED)
async def submit_hardware(
    jam_id: UUID,
    instrument: str,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    instrument = _normalize_hardware_instrument(instrument)
    jam = _get_locked_jam(db, jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")

    participant_row = _get_locked_participant_row(db, jam_id, current_user.id)
    admin_row = _get_locked_admin_row(db, jam_id, current_user.id)
    if not participant_row and not admin_row:
        raise HTTPException(status_code=403, detail="Must be a participant to add hardware")

    existing = db.query(JamHardware).filter(
        JamHardware.jam_id == jam_id,
        func.lower(JamHardware.instrument) == instrument.lower(),
        JamHardware.owner_id == current_user.id,
    ).with_for_update().first()
    if existing:
        response.status_code = status.HTTP_200_OK
        return _hardware_out(existing)

    is_admin = admin_row is not None
    hw_status = "approved" if (is_admin or not jam.require_hardware_approval) else "pending"

    hw = JamHardware(
        jam_id=jam_id,
        instrument=instrument,
        owner_id=current_user.id,
        status=hw_status,
    )
    db.add(hw)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.query(JamHardware).filter(
            JamHardware.jam_id == jam_id,
            func.lower(JamHardware.instrument) == instrument.lower(),
            JamHardware.owner_id == current_user.id,
        ).first()
        if existing:
            response.status_code = status.HTTP_200_OK
            return _hardware_out(existing)
        raise

    if hw_status == "approved":
        _create_roles_for_hardware(db, jam_id, instrument, current_user.id)

    db.commit()
    db.refresh(hw)

    event_type = "hardware_updated" if hw_status == "approved" else "hardware_pending"
    await publish(f"jam:{jam_id}", json.dumps({"type": event_type, "jam": str(jam_id)}))
    if hw_status == "approved":
        await publish(f"jam:{jam_id}", json.dumps({"type": "role_updated", "jam": str(jam_id)}))
    return _hardware_out(hw)


@router.delete("/{jam_id}/hardware/{hardware_id}", status_code=status.HTTP_200_OK)
async def remove_hardware(
    jam_id: UUID,
    hardware_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = _get_locked_jam(db, jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")

    hw = db.query(JamHardware).filter(
        JamHardware.id == hardware_id,
        JamHardware.jam_id == jam_id,
    ).with_for_update().first()
    if not hw:
        raise HTTPException(status_code=404, detail="Hardware not found")

    is_admin = _get_locked_admin_row(db, jam_id, current_user.id) is not None
    if hw.owner_id != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")

    if hw.status == "approved":
        _delete_unclaimed_roles_for_hardware(db, jam_id, hw.instrument, hw.owner_id)

    db.delete(hw)
    db.commit()
    await publish(f"jam:{jam_id}", json.dumps({"type": "hardware_updated", "jam": str(jam_id)}))
    await publish(f"jam:{jam_id}", json.dumps({"type": "role_updated", "jam": str(jam_id)}))
    return {"detail": "Hardware removed"}


@router.patch("/{jam_id}/hardware/{hardware_id}", response_model=HardwareOut)
async def update_hardware(
    jam_id: UUID,
    hardware_id: UUID,
    body: HardwareUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    instrument = _normalize_hardware_instrument(body.instrument)

    jam = _get_locked_jam(db, jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")

    hw = db.query(JamHardware).filter(
        JamHardware.id == hardware_id,
        JamHardware.jam_id == jam_id,
    ).with_for_update().first()
    if not hw:
        raise HTTPException(status_code=404, detail="Hardware not found")

    is_admin = _get_locked_admin_row(db, jam_id, current_user.id) is not None
    if hw.owner_id != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")

    if hw.instrument.casefold() == instrument.casefold():
        if hw.instrument != instrument:
            old_instrument = hw.instrument
            hw.instrument = instrument
            if hw.status == "approved":
                _rename_roles_for_hardware(db, jam_id, old_instrument, instrument, hw.owner_id)
            db.commit()
            db.refresh(hw)
            await publish(f"jam:{jam_id}", json.dumps({"type": "hardware_updated", "jam": str(jam_id)}))
            if hw.status == "approved":
                await publish(f"jam:{jam_id}", json.dumps({"type": "role_updated", "jam": str(jam_id)}))
        return _hardware_out(hw)

    duplicate = db.query(JamHardware).filter(
        JamHardware.jam_id == jam_id,
        func.lower(JamHardware.instrument) == instrument.lower(),
        JamHardware.owner_id == hw.owner_id,
        JamHardware.id != hardware_id,
    ).with_for_update().first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Hardware already exists")

    old_instrument = hw.instrument
    hw.instrument = instrument
    if hw.status == "approved":
        _rename_roles_for_hardware(db, jam_id, old_instrument, instrument, hw.owner_id)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Hardware already exists")

    db.refresh(hw)
    await publish(f"jam:{jam_id}", json.dumps({"type": "hardware_updated", "jam": str(jam_id)}))
    if hw.status == "approved":
        await publish(f"jam:{jam_id}", json.dumps({"type": "role_updated", "jam": str(jam_id)}))
    return _hardware_out(hw)


@router.patch("/{jam_id}/hardware/{hardware_id}/approve", response_model=HardwareOut)
async def approve_hardware(
    jam_id: UUID,
    hardware_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = _get_locked_jam(db, jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    if not _get_locked_admin_row(db, jam_id, current_user.id):
        raise HTTPException(status_code=403, detail="Admin only")

    hw = db.query(JamHardware).filter(
        JamHardware.id == hardware_id,
        JamHardware.jam_id == jam_id,
    ).with_for_update().first()
    if not hw:
        raise HTTPException(status_code=404, detail="Hardware not found")
    if hw.status == "approved":
        return _hardware_out(hw)

    hw.status = "approved"
    _create_roles_for_hardware(db, jam_id, hw.instrument, hw.owner_id)
    db.commit()
    db.refresh(hw)
    await publish(f"jam:{jam_id}", json.dumps({"type": "hardware_updated", "jam": str(jam_id)}))
    await publish(f"jam:{jam_id}", json.dumps({"type": "role_updated", "jam": str(jam_id)}))
    return _hardware_out(hw)


@router.patch("/{jam_id}/hardware/{hardware_id}/reject", status_code=status.HTTP_200_OK)
async def reject_hardware(
    jam_id: UUID,
    hardware_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = _get_locked_jam(db, jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    if not _get_locked_admin_row(db, jam_id, current_user.id):
        raise HTTPException(status_code=403, detail="Admin only")

    hw = db.query(JamHardware).filter(
        JamHardware.id == hardware_id,
        JamHardware.jam_id == jam_id,
    ).with_for_update().first()
    if not hw:
        raise HTTPException(status_code=404, detail="Hardware not found")
    if hw.status == "approved":
        raise HTTPException(status_code=409, detail="Hardware already approved")

    db.delete(hw)
    db.commit()
    await publish(f"jam:{jam_id}", json.dumps({"type": "hardware_updated", "jam": str(jam_id)}))
    return {"detail": "Hardware rejected"}


# ── Admins ────────────────────────────────────────────────────────────────────

@router.post("/{jam_id}/admins/{user_id}", status_code=status.HTTP_201_CREATED)
async def add_admin(
    jam_id: UUID,
    user_id: str,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = _get_locked_jam(db, jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    if not _get_locked_admin_row(db, jam_id, current_user.id):
        raise HTTPException(status_code=403, detail="Admin only")
    if not db.get(User, user_id):
        raise HTTPException(status_code=404, detail="User not found")

    existing_admin = _get_locked_admin_row(db, jam_id, user_id)
    existing_participant = _get_locked_participant_row(db, jam_id, user_id)
    if existing_admin and existing_participant:
        response.status_code = status.HTTP_200_OK
        return {"detail": "Admin added", "already_admin": True, "joined_as_participant": False}

    promoted_existing_admin = existing_admin is not None
    joined_as_participant = existing_participant is None
    if not existing_admin:
        db.add(JamAdmin(jam_id=jam_id, user_id=user_id))
    if joined_as_participant:
        db.add(JamParticipant(jam_id=jam_id, user_id=user_id))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        duplicate_admin = db.query(JamAdmin).filter(
            JamAdmin.jam_id == jam_id,
            JamAdmin.user_id == user_id,
        ).first()
        duplicate_participant = db.query(JamParticipant).filter(
            JamParticipant.jam_id == jam_id,
            JamParticipant.user_id == user_id,
        ).first()
        if duplicate_admin and duplicate_participant:
            response.status_code = status.HTTP_200_OK
            return {"detail": "Admin added", "already_admin": True, "joined_as_participant": False}
        raise
    if joined_as_participant:
        await publish(
            f"jam:{jam_id}",
            json.dumps({"type": "participant_joined", "user_id": user_id}),
        )
    await publish(f"jam:{jam_id}", json.dumps({"type": "jam_updated", "jam": str(jam_id)}))
    return {
        "detail": "Admin added",
        "already_admin": promoted_existing_admin,
        "joined_as_participant": joined_as_participant,
    }


@router.delete("/{jam_id}/admins/{user_id}", status_code=status.HTTP_200_OK)
async def remove_admin(
    jam_id: UUID,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jam = _get_locked_jam(db, jam_id)
    if not jam:
        raise HTTPException(status_code=404, detail="Jam not found")
    if not _get_locked_admin_row(db, jam_id, current_user.id):
        raise HTTPException(status_code=403, detail="Admin only")

    admin_rows = db.query(JamAdmin).filter(JamAdmin.jam_id == jam_id).with_for_update().all()
    row = next((admin_row for admin_row in admin_rows if admin_row.user_id == user_id), None)
    if row is None:
        return {"detail": "Admin removed", "already_removed": True}
    if len(admin_rows) <= 1:
        raise HTTPException(status_code=400, detail="Cannot remove the last admin")

    db.delete(row)
    db.commit()
    await publish(f"jam:{jam_id}", json.dumps({"type": "jam_updated", "jam": str(jam_id)}))
    return {"detail": "Admin removed", "already_removed": False}

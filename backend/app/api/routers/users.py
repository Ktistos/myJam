from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User, UserInstrument
from app.schemas.user import UserCreate, UserUpdate, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.id == body.id).first():
        raise HTTPException(status_code=409, detail="User already exists")

    user = User(
        id=body.id,
        name=body.name,
        bio=body.bio,
        recording_link=body.recording_link,
        avatar_url=body.avatar_url,
    )
    db.add(user)
    for inst in body.instruments:
        db.add(UserInstrument(user_id=body.id, instrument=inst.instrument, skill_level=inst.skill_level))
    db.commit()
    db.refresh(user)
    return user


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.name is not None:
        current_user.name = body.name
    if body.bio is not None:
        current_user.bio = body.bio
    if body.recording_link is not None:
        current_user.recording_link = body.recording_link
    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url
    if body.instruments is not None:
        db.query(UserInstrument).filter(UserInstrument.user_id == current_user.id).delete()
        for inst in body.instruments:
            db.add(UserInstrument(user_id=current_user.id, instrument=inst.instrument, skill_level=inst.skill_level))
    db.commit()
    db.refresh(current_user)
    return current_user

import logging

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer()
optional_bearer_scheme = HTTPBearer(auto_error=False)

# Reusable HTTP session for fetching Firebase public keys (cached internally by google-auth)
_http_request = google_requests.Request()


def get_uid_for_token(token: str) -> str:
    try:
        # verify_firebase_token downloads Google's public keys over HTTPS and
        # verifies the JWT locally — no service account / ADC required.
        decoded = id_token.verify_firebase_token(
            token,
            _http_request,
            audience=settings.FIREBASE_PROJECT_ID,
        )
    except Exception as e:
        logger.error("verify_firebase_token failed: %s: %s", type(e).__name__, e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    # Firebase UID is the standard JWT 'sub' claim
    return decoded["sub"]


def get_user_for_token(token: str, db: Session) -> User:
    uid = get_uid_for_token(token)
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found — call POST /users first",
        )
    return user


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    return get_uid_for_token(credentials.credentials)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    return get_user_for_token(credentials.credentials, db)


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    try:
        return get_user_for_token(credentials.credentials, db)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            return None
        raise

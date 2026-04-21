import uuid
import io
import mimetypes
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import Response
from minio.error import S3Error

from app.core.auth import get_current_user
from app.core.minio import get_minio
from app.core.config import settings
from app.models.user import User

router = APIRouter(prefix="/uploads", tags=["uploads"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE = 5 * 1024 * 1024  # 5 MB
READ_CHUNK_SIZE = 1024 * 1024


def _avatar_public_url(object_name: str) -> str:
    prefix = "avatars/"
    if not object_name.startswith(prefix):
        raise HTTPException(status_code=500, detail="Avatar object path is invalid")
    user_id, filename = object_name[len(prefix):].split("/", 1)
    base_url = settings.BACKEND_PUBLIC_URL.rstrip("/")
    return f"{base_url}/uploads/avatar/{user_id}/{filename}"


@router.post("/avatar", response_model=dict)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP and GIF are allowed")

    chunks = []
    total_size = 0
    while True:
        chunk = await file.read(READ_CHUNK_SIZE)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > MAX_SIZE:
            raise HTTPException(status_code=400, detail="File too large (max 5 MB)")
        chunks.append(chunk)

    data = b"".join(chunks)
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "jpg"
    object_name = f"avatars/{current_user.id}/{uuid.uuid4()}.{ext}"

    client = get_minio()
    try:
        client.put_object(
            settings.MINIO_BUCKET,
            object_name,
            io.BytesIO(data),
            length=total_size,
            content_type=file.content_type,
        )
    except S3Error as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

    return {"url": _avatar_public_url(object_name)}


@router.get("/avatar/{user_id}/{filename}")
def get_avatar(user_id: str, filename: str):
    if "/" in user_id or "/" in filename or not user_id.strip() or not filename.strip():
        raise HTTPException(status_code=404, detail="Avatar not found")

    object_name = f"avatars/{user_id}/{filename}"
    client = get_minio()
    try:
        minio_response = client.get_object(settings.MINIO_BUCKET, object_name)
    except S3Error as exc:
        raise HTTPException(status_code=404, detail="Avatar not found") from exc

    try:
        content = minio_response.read()
        content_type = (
            minio_response.headers.get("Content-Type")
            or mimetypes.guess_type(filename)[0]
            or "application/octet-stream"
        )
    finally:
        minio_response.close()
        minio_response.release_conn()

    return Response(
        content=content,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )

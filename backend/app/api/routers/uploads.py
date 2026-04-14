import uuid
import io
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from minio.error import S3Error

from app.core.auth import get_current_user
from app.core.minio import get_minio
from app.core.config import settings
from app.models.user import User

router = APIRouter(prefix="/uploads", tags=["uploads"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE = 5 * 1024 * 1024  # 5 MB
READ_CHUNK_SIZE = 1024 * 1024


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

    base_url = settings.MINIO_PUBLIC_URL or f"http://{settings.MINIO_ENDPOINT}"
    url = f"{base_url}/{settings.MINIO_BUCKET}/{object_name}"
    return {"url": url}

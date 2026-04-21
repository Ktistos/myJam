from minio import Minio
from minio.error import S3Error

from app.core.config import settings

_client: Minio | None = None


def get_minio() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        _ensure_bucket(_client)
    return _client


def _ensure_bucket(client: Minio) -> None:
    try:
        if not client.bucket_exists(settings.MINIO_BUCKET):
            client.make_bucket(settings.MINIO_BUCKET)

        # Existing development buckets may predate the public policy. Re-apply it
        # on startup so old local volumes do not break already uploaded avatars.
        import json
        policy = {
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"AWS": ["*"]},
                "Action": ["s3:GetObject"],
                "Resource": [f"arn:aws:s3:::{settings.MINIO_BUCKET}/*"],
            }],
        }
        client.set_bucket_policy(settings.MINIO_BUCKET, json.dumps(policy))
    except S3Error as e:
        raise RuntimeError(f"MinIO bucket setup failed: {e}")

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str = "redis://redis:6379"
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_BUCKET: str = "avatars"
    MINIO_SECURE: bool = False
    FIREBASE_PROJECT_ID: str

    class Config:
        env_file = ".env"


settings = Settings()

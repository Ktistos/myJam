from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    REDIS_URL: str = "redis://redis:6379"
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_PUBLIC_URL: str | None = None
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_BUCKET: str = "avatars"
    MINIO_SECURE: bool = False
    FIREBASE_PROJECT_ID: str
    SPOTIFY_CLIENT_ID: str | None = None
    SPOTIFY_CLIENT_SECRET: str | None = None
    SPOTIFY_MARKET: str | None = "US"
    SPOTIFY_REDIRECT_URI: str = "http://127.0.0.1:8000/spotify/callback"
    FRONTEND_URL: str = "http://localhost:8080"


settings = Settings()

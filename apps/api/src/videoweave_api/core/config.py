from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[5]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(_REPO_ROOT / ".env", ".env"), extra="ignore")

    environment: str = Field(default="development", validation_alias="VIDEOWEAVE_ENV")
    cors_origins: str = Field(default="http://localhost:3000", validation_alias="VIDEOWEAVE_CORS_ORIGINS")
    database_url: str = Field(
        default="postgresql+psycopg://videoweave:videoweave@localhost:5432/videoweave",
        validation_alias="DATABASE_URL",
    )

    redis_url: str = Field(default="redis://localhost:6379/0", validation_alias="REDIS_URL")
    job_queue_key: str = Field(default="videoweave:jobs", validation_alias="JOB_QUEUE_KEY")
    worker_poll_seconds: int = Field(default=5, validation_alias="WORKER_POLL_SECONDS")

    s3_endpoint_url: str | None = Field(default="http://localhost:9000", validation_alias="S3_ENDPOINT_URL")
    s3_region: str = Field(default="us-east-1", validation_alias="S3_REGION")
    s3_bucket: str = Field(default="videoweave", validation_alias="S3_BUCKET")
    s3_access_key: str = Field(default="videoweave", validation_alias="S3_ACCESS_KEY")
    s3_secret_key: str = Field(default="videoweave-local-dev", validation_alias="S3_SECRET_KEY")
    s3_force_path_style: bool = Field(default=True, validation_alias="S3_FORCE_PATH_STYLE")
    s3_presign_expiry_seconds: int = Field(default=3600, validation_alias="S3_PRESIGN_EXPIRY_SECONDS")
    s3_multipart_part_size_mb: int = Field(default=64, validation_alias="S3_MULTIPART_PART_SIZE_MB")

    ffmpeg_binary: str = Field(default="ffmpeg", validation_alias="FFMPEG_BINARY")
    ffmpeg_timeout_seconds: int = Field(default=120, validation_alias="FFMPEG_TIMEOUT_SECONDS")
    ffprobe_binary: str = Field(default="ffprobe", validation_alias="FFPROBE_BINARY")
    ffprobe_timeout_seconds: int = Field(default=30, validation_alias="FFPROBE_TIMEOUT_SECONDS")

    @property
    def cors_origin_list(self) -> list[str]:
        return [value.strip() for value in self.cors_origins.split(",") if value.strip()]

    @property
    def multipart_part_size_bytes(self) -> int:
        return self.s3_multipart_part_size_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()

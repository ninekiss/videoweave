from collections.abc import Generator
from functools import lru_cache

from sqlalchemy.orm import Session

from videoweave_api.core.config import get_settings
from videoweave_api.db.session import SessionLocal
from videoweave_api.infrastructure.jobs.queue import RedisJobQueue
from videoweave_api.infrastructure.storage.s3 import S3Storage


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@lru_cache
def get_storage() -> S3Storage:
    return S3Storage(get_settings())


@lru_cache
def get_job_queue() -> RedisJobQueue:
    return RedisJobQueue(get_settings())

import os
import socket

from videoweave_api.core.config import get_settings
from videoweave_api.db.session import SessionLocal
from videoweave_api.infrastructure.jobs.queue import RedisJobQueue
from videoweave_api.infrastructure.storage.s3 import S3Storage
from videoweave_api.services.worker import WorkerService


def _worker_id() -> str:
    return f"{socket.gethostname()}:{os.getpid()}"


def main() -> None:
    settings = get_settings()
    queue = RedisJobQueue(settings)
    storage = S3Storage(settings)
    worker_id = _worker_id()

    queue.ping()
    print(f"VideoWeave worker {worker_id} listening on {settings.job_queue_key}")

    try:
        while True:
            job_id = queue.pop(settings.worker_poll_seconds)
            if not job_id:
                continue
            db = SessionLocal()
            try:
                WorkerService(db, storage, settings, worker_id).process(job_id)
            finally:
                db.close()
    except KeyboardInterrupt:
        print("VideoWeave worker stopped")


if __name__ == "__main__":
    main()

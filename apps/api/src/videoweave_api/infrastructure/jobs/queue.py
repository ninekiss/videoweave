from redis import Redis

from videoweave_api.core.config import Settings


class RedisJobQueue:
    """Thin queue adapter. PostgreSQL remains the source of truth for Job state."""

    def __init__(self, settings: Settings) -> None:
        self.key = settings.job_queue_key
        self.client = Redis.from_url(settings.redis_url, decode_responses=True)

    def ping(self) -> bool:
        return bool(self.client.ping())

    def enqueue(self, job_id: str) -> None:
        self.client.rpush(self.key, job_id)

    def pop(self, timeout: int) -> str | None:
        item = self.client.blpop(self.key, timeout=timeout)
        if item is None:
            return None
        _, job_id = item
        return job_id

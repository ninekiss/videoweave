from redis import Redis
from redis.exceptions import TimeoutError as RedisTimeoutError

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
        try:
            item = self.client.blpop(self.key, timeout=timeout)
        except RedisTimeoutError:
            # A blocking pop timing out just means the queue is idle. Some
            # redis-py/platform combinations surface this as a socket timeout
            # instead of returning None when the BLPOP wait expires.
            return None

        if item is None:
            return None
        _, job_id = item
        return job_id

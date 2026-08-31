from redis.exceptions import TimeoutError as RedisTimeoutError

from videoweave_api.infrastructure.jobs.queue import RedisJobQueue


class _TimeoutClient:
    def blpop(self, key: str, timeout: int):
        raise RedisTimeoutError("Timeout reading from socket")


def test_blocking_pop_timeout_is_idle() -> None:
    queue = object.__new__(RedisJobQueue)
    queue.key = "videoweave:jobs"
    queue.client = _TimeoutClient()

    assert queue.pop(2) is None

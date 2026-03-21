"""Redis-based persistent task queue.

API process enqueues tasks; independent worker processes dequeue and execute.
"""

import json
import logging
from datetime import datetime, timezone

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

QUEUE_KEY = "swaneval:task_queue"
RUNNING_KEY = "swaneval:running_tasks"
WORKER_KEY = "swaneval:workers"


def _get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


async def enqueue_task(task_id: str, execution_backend: str = "external_api") -> None:
    """Push a task onto the persistent queue."""
    r = _get_redis()
    payload = json.dumps({
        "task_id": task_id,
        "execution_backend": execution_backend,
        "enqueued_at": datetime.now(timezone.utc).isoformat(),
    })
    await r.rpush(QUEUE_KEY, payload)
    logger.info("Task %s enqueued (backend=%s)", task_id, execution_backend)
    await r.aclose()


async def dequeue_task(timeout: int = 5) -> dict | None:
    """Blocking pop from the task queue. Returns None on timeout."""
    r = _get_redis()
    result = await r.blpop(QUEUE_KEY, timeout=timeout)
    await r.aclose()
    if result is None:
        return None
    _, payload = result
    return json.loads(payload)


async def mark_running(task_id: str, worker_id: str) -> None:
    """Track that a task is being executed by a worker."""
    r = _get_redis()
    await r.hset(RUNNING_KEY, task_id, json.dumps({
        "worker_id": worker_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }))
    await r.aclose()


async def mark_done(task_id: str) -> None:
    """Remove task from the running set."""
    r = _get_redis()
    await r.hdel(RUNNING_KEY, task_id)
    await r.aclose()


async def get_queue_status() -> dict:
    """Return queue metrics: pending, running, workers."""
    r = _get_redis()
    pending = await r.llen(QUEUE_KEY)
    running = await r.hlen(RUNNING_KEY)
    workers = await r.hlen(WORKER_KEY)
    await r.aclose()
    return {"pending": pending, "running": running, "workers": workers}


async def register_worker(worker_id: str) -> None:
    """Register a worker as alive."""
    r = _get_redis()
    await r.hset(WORKER_KEY, worker_id, json.dumps({
        "registered_at": datetime.now(timezone.utc).isoformat(),
        "status": "idle",
    }))
    await r.aclose()


async def update_worker_status(worker_id: str, status: str) -> None:
    """Update worker status (idle, busy, stopping)."""
    r = _get_redis()
    await r.hset(WORKER_KEY, worker_id, json.dumps({
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }))
    await r.aclose()


async def unregister_worker(worker_id: str) -> None:
    """Remove worker from the registry."""
    r = _get_redis()
    await r.hdel(WORKER_KEY, worker_id)
    await r.aclose()

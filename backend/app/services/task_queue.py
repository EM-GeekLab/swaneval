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


_pool: aioredis.Redis | None = None


def _get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(
            settings.REDIS_URL, decode_responses=True,
            max_connections=10,
        )
    return _pool


async def close_pool() -> None:
    """Close the connection pool (call on shutdown)."""
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None


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


async def dequeue_task(timeout: int = 5) -> dict | None:
    """Blocking pop from the task queue. Returns None on timeout."""
    r = _get_redis()
    result = await r.blpop(QUEUE_KEY, timeout=timeout)
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


async def mark_done(task_id: str) -> None:
    """Remove task from the running set."""
    r = _get_redis()
    await r.hdel(RUNNING_KEY, task_id)


async def get_queue_status() -> dict:
    """Return queue metrics: pending, running, workers."""
    r = _get_redis()
    pending = await r.llen(QUEUE_KEY)
    running = await r.hlen(RUNNING_KEY)
    workers = await r.hlen(WORKER_KEY)
    return {"pending": pending, "running": running, "workers": workers}


async def register_worker(worker_id: str) -> None:
    """Register a worker as alive."""
    r = _get_redis()
    await r.hset(WORKER_KEY, worker_id, json.dumps({
        "registered_at": datetime.now(timezone.utc).isoformat(),
        "status": "idle",
    }))


async def update_worker_status(worker_id: str, status: str) -> None:
    """Update worker status (idle, busy, stopping)."""
    r = _get_redis()
    await r.hset(WORKER_KEY, worker_id, json.dumps({
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }))


async def unregister_worker(worker_id: str) -> None:
    """Remove worker from the registry."""
    r = _get_redis()
    await r.hdel(WORKER_KEY, worker_id)


async def embedded_worker_loop() -> None:
    """In-process worker loop for development / single-server deployments.

    Runs as an asyncio task inside the API process. Dequeues tasks from
    Redis and executes them without needing a separate worker process.
    """
    import uuid as _uuid

    from app.services.task_runner import run_task

    worker_id = f"embedded-{_uuid.uuid4().hex[:8]}"
    await register_worker(worker_id)
    logger.info("Embedded worker %s started", worker_id)

    try:
        while True:
            await update_worker_status(worker_id, "idle")
            try:
                job = await dequeue_task(timeout=3)
            except Exception:
                # Redis connection error — wait and retry
                import asyncio
                await asyncio.sleep(5)
                continue

            if job is None:
                continue

            task_id = job["task_id"]
            logger.info("Embedded worker picked up task %s", task_id)
            await update_worker_status(worker_id, "busy")
            await mark_running(task_id, worker_id)

            try:
                await run_task(_uuid.UUID(task_id))
            except Exception:
                logger.exception("Embedded worker: task %s failed", task_id)
            finally:
                await mark_done(task_id)
    except Exception:
        pass  # CancelledError on shutdown
    finally:
        await unregister_worker(worker_id)
        logger.info("Embedded worker %s stopped", worker_id)

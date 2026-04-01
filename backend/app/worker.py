"""Independent task worker process.

Usage: uv run python -m app.worker

Connects to Redis queue, dequeues tasks, and executes them.
Does NOT run in the API process.
"""

import asyncio
import logging
import os
import signal
import uuid

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] worker: %(message)s",
)
logger = logging.getLogger(__name__)

WORKER_ID = f"worker-{os.getpid()}-{uuid.uuid4().hex[:8]}"
_shutdown = False


def _handle_signal(sig, frame):
    global _shutdown
    logger.info("Received signal %s, shutting down gracefully...", sig)
    _shutdown = True


async def run_worker():
    """Main worker loop: dequeue tasks and execute them."""
    from app.services.task_failures import ensure_task_failed_in_db
    from app.services.task_queue import (
        dequeue_task,
        mark_done,
        mark_running,
        register_worker,
        unregister_worker,
        update_worker_status,
    )
    from app.services.task_runner import run_task

    await register_worker(WORKER_ID)
    logger.info("Worker %s started, waiting for tasks...", WORKER_ID)

    try:
        while not _shutdown:
            await update_worker_status(WORKER_ID, "idle")
            job = await dequeue_task(timeout=5)
            if job is None:
                continue

            task_id = job["task_id"]
            backend = job.get("execution_backend", "external_api")
            logger.info(
                "Worker %s picked up task %s (backend=%s)",
                WORKER_ID, task_id, backend,
            )

            await update_worker_status(WORKER_ID, "busy")
            await mark_running(task_id, WORKER_ID)

            try:
                await run_task(uuid.UUID(task_id))
                logger.info("Task %s completed", task_id)
            except Exception:
                logger.exception("Task %s failed with exception", task_id)
                await ensure_task_failed_in_db(task_id)
            finally:
                await mark_done(task_id)

    finally:
        await update_worker_status(WORKER_ID, "stopping")
        await unregister_worker(WORKER_ID)
        logger.info("Worker %s stopped", WORKER_ID)


def main():
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()

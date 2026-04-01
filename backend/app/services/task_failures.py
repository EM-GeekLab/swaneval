"""Helpers for defensive task failure handling."""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


async def ensure_task_failed_in_db(task_id: str) -> None:
    """Defensively mark a task as failed if it is not already terminal."""
    try:
        import uuid as _uuid

        from sqlmodel.ext.asyncio.session import AsyncSession

        from app.database import engine
        from app.models.eval_task import EvalTask, TaskStatus

        async with AsyncSession(engine) as session:
            task = await session.get(EvalTask, _uuid.UUID(task_id))
            if task and task.status not in (TaskStatus.failed, TaskStatus.completed):
                task.status = TaskStatus.failed
                task.finished_at = datetime.now(timezone.utc)
                session.add(task)
                await session.commit()
                logger.info("Task %s defensively marked as FAILED in DB", task_id)
    except Exception:
        logger.exception("Failed to defensively update task %s status", task_id)

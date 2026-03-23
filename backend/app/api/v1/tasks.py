import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db, require_permission
from app.models.eval_result import EvalResult
from app.models.eval_task import EvalSubtask, EvalTask, TaskStatus
from app.models.llm_model import LLMModel
from app.models.user import User
from app.schemas.task import SubtaskResponse, TaskCreate, TaskResponse
from app.services.task_queue import enqueue_task


async def _enrich_task(session: AsyncSession, task: EvalTask) -> TaskResponse:
    """Convert EvalTask to TaskResponse with model_name resolved."""
    model_name = ""
    if task.model_id:
        model = await session.get(LLMModel, task.model_id)
        if model:
            model_name = model.name
    return TaskResponse(
        id=task.id,
        name=task.name,
        status=task.status,
        model_id=task.model_id,
        model_name=model_name,
        dataset_ids=task.dataset_ids,
        criteria_ids=task.criteria_ids,
        params_json=task.params_json,
        repeat_count=task.repeat_count,
        seed_strategy=task.seed_strategy,
        gpu_ids=getattr(task, "gpu_ids", "") or "",
        env_vars=getattr(task, "env_vars", "") or "",
        execution_backend=getattr(task, "execution_backend", "") or "external_api",
        resource_config=getattr(task, "resource_config", "") or "",
        worker_id=getattr(task, "worker_id", "") or "",
        error_summary=getattr(task, "error_summary", "") or "",
        total_prompts=getattr(task, "total_prompts", 0) or 0,
        completed_prompts=getattr(task, "completed_prompts", 0) or 0,
        cluster_id=getattr(task, "cluster_id", None),
        started_at=task.started_at,
        finished_at=task.finished_at,
        created_at=task.created_at,
    )

router = APIRouter()


@router.post("", response_model=TaskResponse, status_code=201)
async def create_task(
    body: TaskCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("tasks.create"),
):
    task = EvalTask(
        name=body.name,
        status=TaskStatus.pending,
        model_id=body.model_id,
        dataset_ids=",".join(str(d) for d in body.dataset_ids),
        criteria_ids=",".join(str(c) for c in body.criteria_ids),
        params_json=body.params_json,
        repeat_count=body.repeat_count,
        seed_strategy=body.seed_strategy,
        gpu_ids=body.gpu_ids,
        env_vars=body.env_vars,
        execution_backend=body.execution_backend,
        resource_config=body.resource_config,
        cluster_id=body.cluster_id,
        created_by=current_user.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    # Enqueue task for worker execution
    await enqueue_task(str(task.id))

    return await _enrich_task(session, task)


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    status_filter: TaskStatus | None = None,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("tasks.read"),
):
    stmt = select(EvalTask).order_by(EvalTask.created_at.desc())
    if status_filter:
        stmt = stmt.where(EvalTask.status == status_filter)
    result = await session.exec(stmt)
    tasks = result.all()
    return [await _enrich_task(session, t) for t in tasks]


@router.get("/queue-status")
async def queue_status(
    current_user: User = require_permission("tasks.read"),
):
    """Return task queue metrics."""
    from app.services.task_queue import get_queue_status

    return await get_queue_status()


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("tasks.read"),
):
    task = await session.get(EvalTask, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return await _enrich_task(session, task)


@router.get("/{task_id}/subtasks", response_model=list[SubtaskResponse])
async def list_subtasks(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("tasks.read"),
):
    stmt = (
        select(EvalSubtask)
        .where(EvalSubtask.task_id == task_id)
        .order_by(EvalSubtask.run_index)
    )
    result = await session.exec(stmt)
    return result.all()


@router.post("/{task_id}/pause", response_model=TaskResponse)
async def pause_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("tasks.manage"),
):
    task = await session.get(EvalTask, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    if task.status != TaskStatus.running:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Task is not running")
    task.status = TaskStatus.paused
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return await _enrich_task(session, task)


@router.post("/{task_id}/resume", response_model=TaskResponse)
async def resume_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("tasks.manage"),
):
    task = await session.get(EvalTask, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    if task.status not in (TaskStatus.paused, TaskStatus.failed):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Task cannot be resumed")
    task.status = TaskStatus.pending
    session.add(task)
    await session.commit()
    await session.refresh(task)

    await enqueue_task(str(task.id))
    return await _enrich_task(session, task)


@router.post("/{task_id}/cancel", response_model=TaskResponse)
async def cancel_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("tasks.manage"),
):
    task = await session.get(EvalTask, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    task.status = TaskStatus.cancelled
    session.add(task)
    # Also cancel running subtasks
    stmt = select(EvalSubtask).where(
        EvalSubtask.task_id == task_id,
        EvalSubtask.status.in_([TaskStatus.running, TaskStatus.pending]),
    )
    result = await session.exec(stmt)
    for st in result.all():
        st.status = TaskStatus.cancelled
        session.add(st)
    await session.commit()
    await session.refresh(task)
    return await _enrich_task(session, task)


@router.post("/{task_id}/restart", response_model=TaskResponse)
async def restart_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("tasks.manage"),
):
    """Restart a failed/cancelled task from scratch — clears all results."""
    task = await session.get(EvalTask, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    if task.status not in (TaskStatus.failed, TaskStatus.cancelled):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "只有失败或已取消的任务可以重启",
        )
    # Delete old results
    stmt = select(EvalResult).where(EvalResult.task_id == task_id)
    for r in (await session.exec(stmt)).all():
        await session.delete(r)
    # Delete old subtasks
    stmt = select(EvalSubtask).where(EvalSubtask.task_id == task_id)
    for st in (await session.exec(stmt)).all():
        await session.delete(st)
    # Reset task state
    task.status = TaskStatus.pending
    task.started_at = None
    task.finished_at = None
    session.add(task)
    await session.commit()
    await session.refresh(task)
    # Enqueue the task again for worker execution
    await enqueue_task(str(task.id))
    return await _enrich_task(session, task)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("tasks.manage"),
):
    task = await session.get(EvalTask, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")

    # Delete results referencing this task
    stmt = select(EvalResult).where(EvalResult.task_id == task_id)
    results = (await session.exec(stmt)).all()
    for r in results:
        await session.delete(r)

    # Delete subtasks
    stmt = select(EvalSubtask).where(EvalSubtask.task_id == task_id)
    subtasks = (await session.exec(stmt)).all()
    for s in subtasks:
        await session.delete(s)

    await session.delete(task)
    await session.commit()

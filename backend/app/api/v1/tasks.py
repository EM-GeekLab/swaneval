"""Task management endpoints."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlmodel import SQLModel, Session, select

from app.database import get_db
from app.db.models import Evaluation, TaskStatus
from app.security import get_current_user

router = APIRouter()


class TaskStatusResponse(SQLModel):
    id: int
    name: str
    status: str
    progress: float
    message: Optional[str] = None
    created_at: str
    updated_at: str


class TaskCancelResponse(SQLModel):
    success: bool
    message: str


def _response(t: Evaluation) -> TaskStatusResponse:
    return TaskStatusResponse(
        id=t.id, name=t.name, status=t.status, progress=t.progress,
        message=None, created_at=t.created_at.isoformat(), updated_at=t.updated_at.isoformat()
    )


def _get_task(db: Session, task_id: int, user_id: int) -> Evaluation:
    task = db.exec(
        select(Evaluation).where(Evaluation.id == task_id, Evaluation.user_id == user_id)
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("", response_model=List[TaskStatusResponse])
def list_tasks(
    skip: int = 0, limit: int = 50, status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all tasks."""
    query = select(Evaluation).where(Evaluation.user_id == current_user["id"])
    if status:
        query = query.where(Evaluation.status == TaskStatus(status))
    query = query.order_by(Evaluation.created_at.desc()).offset(skip).limit(limit)
    return [_response(t) for t in db.exec(query).all()]


@router.get("/{task_id}", response_model=TaskStatusResponse)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get task status."""
    return _response(_get_task(db, task_id, current_user["id"]))


@router.post("/{task_id}/cancel", response_model=TaskCancelResponse)
def cancel_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Cancel a task."""
    task = _get_task(db, task_id, current_user["id"])
    if task.status not in [TaskStatus.PENDING, TaskStatus.RUNNING]:
        return TaskCancelResponse(success=False, message=f"Cannot cancel task with status: {task.status}")
    task.status = TaskStatus.CANCELLED
    db.add(task)
    db.commit()
    return TaskCancelResponse(success=True, message="Task cancelled successfully")


@router.post("/{task_id}/pause")
def pause_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Pause a running task."""
    task = _get_task(db, task_id, current_user["id"])
    if task.status != TaskStatus.RUNNING:
        return {"success": False, "message": "Task is not running"}
    task.status = TaskStatus.PAUSED
    db.add(task)
    db.commit()
    return {"success": True, "message": "Task paused"}


@router.post("/{task_id}/resume")
def resume_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Resume a paused task."""
    task = _get_task(db, task_id, current_user["id"])
    if task.status != TaskStatus.PAUSED:
        return {"success": False, "message": "Task is not paused"}
    task.status = TaskStatus.RUNNING
    db.add(task)
    db.commit()
    return {"success": True, "message": "Task resumed"}


@router.websocket("/ws/{task_id}")
async def task_progress_websocket(websocket: WebSocket, task_id: int):
    """WebSocket endpoint for real-time task progress."""
    await websocket.accept()
    try:
        await websocket.send_json({"type": "status", "task_id": task_id, "status": "connected", "progress": 0})
        while True:
            await websocket.receive_text()
            await websocket.send_json({"type": "heartbeat", "task_id": task_id})
    except WebSocketDisconnect:
        pass

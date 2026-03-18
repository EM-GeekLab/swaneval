"""Evaluation task endpoints."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import SQLModel, Session, select

from app.database import get_db
from app.db.models import Evaluation, TaskStatus
from app.security import get_current_user

router = APIRouter()


class GenerationConfig(SQLModel):
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 2048
    top_p: Optional[float] = 0.9
    top_k: Optional[int] = 50


class DatasetArgs(SQLModel):
    limit: Optional[int] = None
    few_shot_num: Optional[int] = 0
    few_shot_random: Optional[bool] = True


class EvalConfig(SQLModel):
    metrics: Optional[List[str]] = ["exact_match"]
    eval_type: Optional[str] = "native"


class EvaluationCreate(SQLModel):
    name: str
    description: Optional[str] = None
    model_id: int
    dataset_id: int
    generation_config: Optional[GenerationConfig] = None
    dataset_args: Optional[DatasetArgs] = None
    eval_config: Optional[EvalConfig] = None


class EvaluationUpdate(SQLModel):
    status: Optional[str] = None
    progress: Optional[float] = None
    metrics: Optional[dict] = None


class EvaluationResponse(SQLModel):
    id: int
    name: str
    description: Optional[str] = None
    model_id: int
    dataset_id: int
    status: str
    progress: float
    metrics: Optional[dict] = None
    created_at: str
    updated_at: str
    completed_at: Optional[str] = None


class EvaluationDetailResponse(EvaluationResponse):
    generation_config: Optional[dict] = None
    dataset_args: Optional[dict] = None
    eval_config: Optional[dict] = None


def _response(e: Evaluation) -> EvaluationResponse:
    return EvaluationResponse(
        id=e.id, name=e.name, description=e.description,
        model_id=e.model_config_id, dataset_id=e.dataset_id,
        status=e.status, progress=e.progress, metrics=e.metrics,
        created_at=e.created_at.isoformat(), updated_at=e.updated_at.isoformat(),
        completed_at=e.completed_at.isoformat() if e.completed_at else None
    )


@router.get("", response_model=List[EvaluationResponse])
def list_evaluations(
    skip: int = 0, limit: int = 50, status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all evaluations."""
    query = select(Evaluation).where(Evaluation.user_id == current_user["id"])
    if status:
        query = query.where(Evaluation.status == TaskStatus(status))
    query = query.order_by(Evaluation.created_at.desc()).offset(skip).limit(limit)
    return [_response(e) for e in db.exec(query).all()]


@router.post("", response_model=EvaluationResponse, status_code=status.HTTP_201_CREATED)
def create_evaluation(
    evaluation: EvaluationCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a new evaluation task."""
    db_eval = Evaluation(
        name=evaluation.name, description=evaluation.description,
        model_config_id=evaluation.model_id, dataset_id=evaluation.dataset_id,
        user_id=current_user["id"],
        generation_config=evaluation.generation_config.model_dump() if evaluation.generation_config else None,
        dataset_args=evaluation.dataset_args.model_dump() if evaluation.dataset_args else None,
        eval_config=evaluation.eval_config.model_dump() if evaluation.eval_config else None,
        status=TaskStatus.PENDING, progress=0.0,
    )
    db.add(db_eval)
    db.commit()
    db.refresh(db_eval)
    return _response(db_eval)


@router.get("/{evaluation_id}", response_model=EvaluationDetailResponse)
def get_evaluation(
    evaluation_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get evaluation details."""
    e = db.exec(
        select(Evaluation).where(Evaluation.id == evaluation_id, Evaluation.user_id == current_user["id"])
    ).first()
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")
    return EvaluationDetailResponse(
        id=e.id, name=e.name, description=e.description,
        model_id=e.model_config_id, dataset_id=e.dataset_id,
        status=e.status, progress=e.progress, metrics=e.metrics,
        generation_config=e.generation_config, dataset_args=e.dataset_args, eval_config=e.eval_config,
        created_at=e.created_at.isoformat(), updated_at=e.updated_at.isoformat(),
        completed_at=e.completed_at.isoformat() if e.completed_at else None
    )


@router.patch("/{evaluation_id}", response_model=EvaluationResponse)
def update_evaluation(
    evaluation_id: int, update: EvaluationUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Update an evaluation."""
    e = db.exec(
        select(Evaluation).where(Evaluation.id == evaluation_id, Evaluation.user_id == current_user["id"])
    ).first()
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")

    if update.status:
        e.status = TaskStatus(update.status)
    if update.progress is not None:
        e.progress = update.progress
    if update.metrics is not None:
        e.metrics = update.metrics

    db.add(e)
    db.commit()
    db.refresh(e)
    return _response(e)


@router.delete("/{evaluation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_evaluation(
    evaluation_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Delete an evaluation."""
    e = db.exec(
        select(Evaluation).where(Evaluation.id == evaluation_id, Evaluation.user_id == current_user["id"])
    ).first()
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")
    db.delete(e)
    db.commit()

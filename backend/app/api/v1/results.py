import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func as sa_func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.criterion import Criterion
from app.models.eval_result import EvalResult
from app.models.eval_task import EvalTask
from app.models.llm_model import LLMModel
from app.models.user import User
from app.schemas.result import PaginatedResultResponse

router = APIRouter()


@router.get("", response_model=PaginatedResultResponse)
async def list_results(
    task_id: uuid.UUID | None = None,
    criterion_id: uuid.UUID | None = None,
    page: int = 1,
    page_size: int = 50,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base = select(EvalResult)
    if task_id:
        base = base.where(EvalResult.task_id == task_id)
    if criterion_id:
        base = base.where(EvalResult.criterion_id == criterion_id)

    count_stmt = select(sa_func.count()).select_from(base.subquery())
    total = (await session.exec(count_stmt)).one()

    offset = (page - 1) * page_size
    items_stmt = base.order_by(EvalResult.created_at.desc()).offset(offset).limit(page_size)
    result = await session.exec(items_stmt)
    return PaginatedResultResponse(items=result.all(), total=total, page=page, page_size=page_size)


@router.get("/leaderboard")
async def leaderboard(
    criterion_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregate avg scores per model, per criterion (valid results only)."""
    stmt = (
        select(
            EvalTask.model_id,
            LLMModel.name.label("model_name"),
            EvalResult.criterion_id,
            Criterion.name.label("criterion_name"),
            sa_func.avg(EvalResult.score).label("avg_score"),
            sa_func.count(EvalResult.id).label("total_prompts"),
            sa_func.avg(EvalResult.latency_ms).label("avg_latency_ms"),
        )
        .join(EvalTask, EvalResult.task_id == EvalTask.id)
        .join(LLMModel, EvalTask.model_id == LLMModel.id)
        .join(Criterion, EvalResult.criterion_id == Criterion.id)
        .where(EvalResult.is_valid == True)  # noqa: E712
        .group_by(EvalTask.model_id, LLMModel.name, EvalResult.criterion_id, Criterion.name)
        .order_by(sa_func.avg(EvalResult.score).desc())
    )
    if criterion_id:
        stmt = stmt.where(EvalResult.criterion_id == criterion_id)

    result = await session.exec(stmt)
    rows = result.all()
    return [
        {
            "model_id": str(r.model_id),
            "model_name": r.model_name,
            "criterion_id": str(r.criterion_id),
            "criterion_name": r.criterion_name,
            "avg_score": round(r.avg_score, 4),
            "total_prompts": r.total_prompts,
            "avg_latency_ms": round(r.avg_latency_ms, 2),
        }
        for r in rows
    ]


@router.get("/errors", response_model=PaginatedResultResponse)
async def error_results(
    task_id: uuid.UUID,
    error_only: bool = False,
    page: int = 1,
    page_size: int = 50,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return problematic results.

    error_only=False (default): wrong answers (score < 1.0, valid results only)
    error_only=True: infrastructure failures (is_valid=False)
    """
    base = select(EvalResult).where(EvalResult.task_id == task_id)
    if error_only:
        base = base.where(EvalResult.is_valid == False)  # noqa: E712
    else:
        base = base.where(EvalResult.score < 1.0, EvalResult.is_valid == True)  # noqa: E712

    count_stmt = select(sa_func.count()).select_from(base.subquery())
    total = (await session.exec(count_stmt)).one()

    offset = (page - 1) * page_size
    items_stmt = base.order_by(EvalResult.score.asc()).offset(offset).limit(page_size)
    result = await session.exec(items_stmt)
    return PaginatedResultResponse(items=result.all(), total=total, page=page, page_size=page_size)


@router.get("/summary")
async def task_summary(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Summary stats for a task: avg score per criterion (valid results only), plus error counts."""
    # Valid results aggregation
    stmt = (
        select(
            EvalResult.criterion_id,
            Criterion.name.label("criterion_name"),
            sa_func.avg(EvalResult.score).label("avg_score"),
            sa_func.min(EvalResult.score).label("min_score"),
            sa_func.max(EvalResult.score).label("max_score"),
            sa_func.count(EvalResult.id).label("count"),
            sa_func.avg(EvalResult.latency_ms).label("avg_latency_ms"),
            sa_func.avg(EvalResult.tokens_generated).label("avg_tokens"),
        )
        .join(Criterion, EvalResult.criterion_id == Criterion.id)
        .where(EvalResult.task_id == task_id, EvalResult.is_valid == True)  # noqa: E712
        .group_by(EvalResult.criterion_id, Criterion.name)
    )
    result = await session.exec(stmt)
    rows = result.all()

    # Count invalid (error) results for this task
    error_stmt = (
        select(sa_func.count())
        .select_from(EvalResult)
        .where(EvalResult.task_id == task_id, EvalResult.is_valid == False)  # noqa: E712
    )
    error_count = (await session.exec(error_stmt)).one()

    criteria_data = [
        {
            "criterion_id": str(r.criterion_id),
            "criterion_name": r.criterion_name,
            "avg_score": round(r.avg_score, 4),
            "min_score": round(r.min_score, 4),
            "max_score": round(r.max_score, 4),
            "count": r.count,
            "avg_latency_ms": round(r.avg_latency_ms, 2),
            "avg_tokens": round(r.avg_tokens, 1),
        }
        for r in rows
    ]
    return {"criteria": criteria_data, "error_count": error_count}

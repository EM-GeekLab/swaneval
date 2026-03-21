"""Dashboard metrics API."""

from fastapi import APIRouter, Depends
from sqlalchemy import case
from sqlalchemy import func as sa_func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.eval_result import EvalResult
from app.models.eval_task import EvalTask, TaskStatus
from app.models.user import User

router = APIRouter()


@router.get("/dashboard")
async def dashboard_metrics(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregated metrics for the dashboard overview."""

    # Task counts by status
    task_counts_stmt = select(
        EvalTask.status,
        sa_func.count().label("count"),
    ).group_by(EvalTask.status)
    task_counts_raw = (await session.exec(task_counts_stmt)).all()
    task_counts = {str(row[0]): row[1] for row in task_counts_raw}

    # Recent task activity (last 7 days, per day)
    recent_stmt = select(
        sa_func.date_trunc("day", EvalTask.created_at).label("day"),
        sa_func.count().label("total"),
        sa_func.sum(
            case((EvalTask.status == TaskStatus.completed, 1), else_=0)
        ).label("completed"),
        sa_func.sum(
            case((EvalTask.status == TaskStatus.failed, 1), else_=0)
        ).label("failed"),
    ).group_by("day").order_by("day").limit(7)
    recent_raw = (await session.exec(recent_stmt)).all()
    recent_activity = [
        {
            "date": str(row[0].date()) if row[0] else None,
            "total": row[1],
            "completed": row[2] or 0,
            "failed": row[3] or 0,
        }
        for row in recent_raw
    ]

    # Score distribution (histogram buckets)
    score_stmt = select(
        case(
            (EvalResult.score >= 0.9, "0.9-1.0"),
            (EvalResult.score >= 0.8, "0.8-0.9"),
            (EvalResult.score >= 0.7, "0.7-0.8"),
            (EvalResult.score >= 0.6, "0.6-0.7"),
            (EvalResult.score >= 0.5, "0.5-0.6"),
            (EvalResult.score >= 0.3, "0.3-0.5"),
            else_="0.0-0.3",
        ).label("bucket"),
        sa_func.count().label("count"),
    ).group_by("bucket")
    score_raw = (await session.exec(score_stmt)).all()
    score_dist = {row[0]: row[1] for row in score_raw}

    # Avg latency stats
    latency_stmt = select(
        sa_func.avg(EvalResult.latency_ms).label("avg"),
        sa_func.min(EvalResult.latency_ms).label("min"),
        sa_func.max(EvalResult.latency_ms).label("max"),
        sa_func.count().label("total_evals"),
        sa_func.avg(EvalResult.tokens_generated).label("avg_tokens"),
    )
    lat_row = (await session.exec(latency_stmt)).first()

    return {
        "task_counts": task_counts,
        "recent_activity": recent_activity,
        "score_distribution": score_dist,
        "latency": {
            "avg_ms": round(float(lat_row[0] or 0), 1),
            "min_ms": round(float(lat_row[1] or 0), 1),
            "max_ms": round(float(lat_row[2] or 0), 1),
            "total_evaluations": lat_row[3] or 0,
            "avg_tokens": round(float(lat_row[4] or 0), 1),
        },
    }

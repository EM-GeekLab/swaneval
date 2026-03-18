"""Results endpoints."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import SQLModel, Session, select

from app.database import get_db
from app.db.models import Evaluation, EvaluationResult, TaskStatus
from app.security import get_current_user

router = APIRouter()


class MetricResult(SQLModel):
    metric: str
    value: float


class EvaluationResultsResponse(SQLModel):
    evaluation_id: int
    total_samples: int
    metrics: List[MetricResult]
    results: List[dict]


class LeaderboardEntry(SQLModel):
    model_id: int
    model_name: str
    dataset: str
    metric: str
    value: float
    rank: int


class ColumnChartData(SQLModel):
    metrics: List[str]
    series: List[dict]


class RadarChartData(SQLModel):
    metrics: List[str]
    values: List[float]


class LineChartData(SQLModel):
    x_axis: str
    series: List[dict]


@router.get("/{evaluation_id}/results", response_model=EvaluationResultsResponse)
def get_evaluation_results(
    evaluation_id: int, limit: int = Query(100, le=1000),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get evaluation results."""
    evaluation = db.exec(
        select(Evaluation).where(Evaluation.id == evaluation_id, Evaluation.user_id == current_user["id"])
    ).first()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    results = db.exec(
        select(EvaluationResult).where(EvaluationResult.evaluation_id == evaluation_id).limit(limit)
    ).all()

    metrics = []
    if evaluation.metrics:
        for key, value in evaluation.metrics.items():
            metrics.append(MetricResult(metric=key, value=value))
    elif results:
        correct_count = sum(1 for r in results if r.is_correct)
        if correct_count > 0:
            metrics.append(MetricResult(metric="accuracy", value=correct_count / len(results)))

    return EvaluationResultsResponse(
        evaluation_id=evaluation_id, total_samples=len(results), metrics=metrics,
        results=[{
            "id": r.id,
            "prompt": r.prompt[:100] + "..." if len(r.prompt) > 100 else r.prompt,
            "expected_output": r.expected_output, "actual_output": r.actual_output,
            "is_correct": r.is_correct, "score": r.score, "latency_ms": r.latency_ms
        } for r in results]
    )


@router.get("/leaderboard")
def get_leaderboard(
    dataset: Optional[str] = None, metric: str = "accuracy",
    limit: int = Query(10, le=50),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get model leaderboard."""
    query = select(Evaluation).where(
        Evaluation.user_id == current_user["id"], Evaluation.status == TaskStatus.COMPLETED
    )
    if dataset:
        query = query.where(Evaluation.dataset_id == int(dataset))

    evaluations = db.exec(query).all()
    leaderboard = []
    for e in evaluations:
        if e.metrics and metric in e.metrics:
            leaderboard.append(LeaderboardEntry(
                model_id=e.model_config_id, model_name=f"Model {e.model_config_id}",
                dataset=f"Dataset {e.dataset_id}", metric=metric,
                value=e.metrics[metric], rank=0
            ))

    leaderboard.sort(key=lambda x: x.value, reverse=True)
    for i, entry in enumerate(leaderboard):
        entry.rank = i + 1
    return leaderboard[:limit]


@router.get("/charts/column")
def get_column_chart(
    model_ids: str, metric_ids: str, dataset_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get column chart data for multi-model comparison."""
    model_id_list = [int(m) for m in model_ids.split(",")]
    metric_id_list = metric_ids.split(",")

    series = []
    for model_id in model_id_list:
        eval_obj = db.exec(
            select(Evaluation).where(
                Evaluation.model_config_id == model_id, Evaluation.dataset_id == dataset_id,
                Evaluation.status == TaskStatus.COMPLETED
            ).order_by(Evaluation.created_at.desc()).limit(1)
        ).first()

        data = []
        if eval_obj and eval_obj.metrics:
            data = [round(eval_obj.metrics.get(m, 0), 4) for m in metric_id_list]
        series.append({"name": f"Model {model_id}", "data": data})

    return ColumnChartData(metrics=metric_id_list, series=series)


@router.get("/charts/radar/{model_id}")
def get_radar_chart(
    model_id: int, dataset_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get radar chart data for single model."""
    eval_obj = db.exec(
        select(Evaluation).where(
            Evaluation.model_config_id == model_id, Evaluation.dataset_id == dataset_id,
            Evaluation.status == TaskStatus.COMPLETED
        ).order_by(Evaluation.created_at.desc()).limit(1)
    ).first()

    if not eval_obj or not eval_obj.metrics:
        return RadarChartData(metrics=["accuracy", "precision", "recall", "f1"], values=[0.5, 0.5, 0.5, 0.5])

    metrics = list(eval_obj.metrics.keys())[:6]
    return RadarChartData(metrics=metrics, values=[round(eval_obj.metrics.get(m, 0), 4) for m in metrics])


@router.get("/charts/line/{metric}")
def get_line_chart(
    metric: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get line chart data for cross-version comparison."""
    evaluations = db.exec(
        select(Evaluation).where(
            Evaluation.user_id == current_user["id"], Evaluation.status == TaskStatus.COMPLETED
        ).order_by(Evaluation.created_at.asc())
    ).all()

    x_axis = []
    series = {}
    for e in evaluations:
        if e.metrics and metric in e.metrics:
            date = e.created_at.strftime("%Y-%m-%d")
            model_key = f"Model {e.model_config_id}"
            if date not in x_axis:
                x_axis.append(date)
            series.setdefault(model_key, []).append(round(e.metrics[metric], 4))

    return LineChartData(x_axis=metric, series=[{"name": k, "data": v} for k, v in series.items()])

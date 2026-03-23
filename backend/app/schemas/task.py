import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.eval_task import SeedStrategy, TaskStatus


class TaskCreate(BaseModel):
    name: str
    model_id: uuid.UUID
    dataset_ids: list[uuid.UUID]
    criteria_ids: list[uuid.UUID]
    params_json: str = '{"temperature": 0.7, "max_tokens": 1024}'
    repeat_count: int = 1
    seed_strategy: SeedStrategy = SeedStrategy.fixed
    gpu_ids: str = ""
    env_vars: str = ""
    execution_backend: str = "external_api"
    resource_config: str = ""
    cluster_id: uuid.UUID | None = None


class TaskResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    status: TaskStatus
    model_id: uuid.UUID
    model_name: str = ""
    dataset_ids: str
    criteria_ids: str
    params_json: str
    repeat_count: int
    seed_strategy: SeedStrategy
    gpu_ids: str = ""
    env_vars: str = ""
    execution_backend: str = "external_api"
    resource_config: str = ""
    worker_id: str = ""
    error_summary: str = ""
    total_prompts: int = 0
    completed_prompts: int = 0
    cluster_id: uuid.UUID | None = None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime


class SubtaskResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    task_id: uuid.UUID
    run_index: int
    status: TaskStatus
    progress_pct: float
    last_completed_index: int
    error_log: str


class StabilityStatsResponse(BaseModel):
    """Aggregated stability statistics for repeat_count > 1 tasks."""
    criterion_id: uuid.UUID
    criterion_name: str
    run_count: int
    mean_score: float
    std_dev: float
    variance: float
    ci_95_lower: float
    ci_95_upper: float
    min_score: float
    max_score: float
    per_run_scores: list[float]

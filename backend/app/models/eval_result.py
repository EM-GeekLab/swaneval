import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel


class EvalResult(SQLModel, table=True):
    """
    评估结果模型 / Evaluation result model

    存储每次评估的详细结果，包括 prompt、输出和评分。
    Stores detailed evaluation results including prompt, output, and scores.
    """
    __tablename__ = "eval_results"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    task_id: uuid.UUID = Field(foreign_key="eval_tasks.id", index=True)
    subtask_id: uuid.UUID = Field(foreign_key="eval_subtasks.id")
    dataset_id: uuid.UUID = Field(foreign_key="datasets.id")
    criterion_id: uuid.UUID = Field(foreign_key="criteria.id")

    prompt_text: str = Field(default="")
    expected_output: str = Field(default="")
    model_output: str = Field(default="")
    score: float = Field(default=0.0)
    latency_ms: float = Field(default=0.0)
    tokens_generated: int = Field(default=0)
    first_token_ms: float = Field(default=0.0)

    # Quality tracking — marks whether this result is trustworthy
    is_valid: bool = Field(default=True, index=True)
    # Error classification — set when is_valid=False
    error_category: str | None = Field(default=None)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
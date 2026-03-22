"""Model run log: tracks pull/deploy/test actions on models."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel


class ModelRunLog(SQLModel, table=True):
    """Log entry for model lifecycle actions (pull, deploy, test, etc.)."""

    __tablename__ = "model_run_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    model_id: uuid.UUID = Field(foreign_key="llm_models.id", index=True)
    action: str = Field(max_length=64)
    # Action type: "pull_hf", "pull_ms", "test", "deploy", "undeploy"

    status: str = Field(default="running", max_length=32)
    # "running", "success", "failed"

    message: str = Field(default="")
    # Human-readable result message

    duration_ms: int = Field(default=0)
    # Duration in milliseconds

    triggered_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    # User who triggered this action

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )

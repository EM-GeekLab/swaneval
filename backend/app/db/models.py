"""Database models for EvalScope GUI."""
from datetime import datetime, timezone
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship, Column
from sqlalchemy import Text, JSON, Enum as SQLEnum
import enum


class UserRole(str, enum.Enum):
    """User roles."""
    ADMIN = "admin"
    DATA_MANAGER = "data_manager"
    EVALUATOR = "evaluator"
    GUEST = "guest"


class ModelType(str, enum.Enum):
    """Model types."""
    LOCAL = "local"
    HUGGINGFACE = "huggingface"
    API = "api"


class TaskStatus(str, enum.Enum):
    """Task status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


class DatasetSource(str, enum.Enum):
    """Dataset sources."""
    PRESET = "preset"
    HUGGINGFACE = "huggingface"
    CUSTOM = "custom"
    SERVER_PATH = "server_path"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    """User model."""
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(max_length=50, unique=True, index=True)
    email: str = Field(max_length=255, unique=True, index=True)
    hashed_password: str = Field(max_length=255)
    role: UserRole = Field(sa_column=Column(SQLEnum(UserRole), default=UserRole.GUEST))
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    evaluations: List["Evaluation"] = Relationship(back_populates="user")
    models: List["ModelConfig"] = Relationship(back_populates="user")


class ModelConfig(SQLModel, table=True):
    """Model configuration model."""
    __tablename__ = "model_configs"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=255, index=True)
    model_type: ModelType = Field(sa_column=Column(SQLEnum(ModelType)))
    path: str = Field(sa_column=Column(Text))
    api_key: Optional[str] = Field(default=None, max_length=255)
    config: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    user_id: int = Field(foreign_key="users.id")
    is_public: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    user: Optional["User"] = Relationship(back_populates="models")
    evaluations: List["Evaluation"] = Relationship(back_populates="eval_model")


class Dataset(SQLModel, table=True):
    """Dataset model."""
    __tablename__ = "datasets"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=255, index=True)
    source: DatasetSource = Field(sa_column=Column(SQLEnum(DatasetSource)))
    path: str = Field(sa_column=Column(Text))
    version: int = Field(default=1)
    tags: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    dataset_metadata: Optional[dict] = Field(default=None, sa_column=Column("metadata", JSON, nullable=True))
    row_count: Optional[int] = Field(default=None)
    created_by: int = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    evaluations: List["Evaluation"] = Relationship(back_populates="dataset")


class Evaluation(SQLModel, table=True):
    """Evaluation model."""
    __tablename__ = "evaluations"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    model_config_id: int = Field(foreign_key="model_configs.id")
    dataset_id: int = Field(foreign_key="datasets.id")
    user_id: int = Field(foreign_key="users.id")

    generation_config: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    dataset_args: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    eval_config: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))

    status: TaskStatus = Field(sa_column=Column(SQLEnum(TaskStatus), default=TaskStatus.PENDING))
    progress: float = Field(default=0.0)
    metrics: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))

    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    completed_at: Optional[datetime] = Field(default=None)

    eval_model: Optional["ModelConfig"] = Relationship(back_populates="evaluations")
    dataset: Optional["Dataset"] = Relationship(back_populates="evaluations")
    user: Optional["User"] = Relationship(back_populates="evaluations")
    results: List["EvaluationResult"] = Relationship(back_populates="evaluation")


class EvaluationResult(SQLModel, table=True):
    """Evaluation result model."""
    __tablename__ = "evaluation_results"

    id: Optional[int] = Field(default=None, primary_key=True)
    evaluation_id: int = Field(foreign_key="evaluations.id")
    prompt: str = Field(sa_column=Column(Text))
    expected_output: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    actual_output: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    is_correct: Optional[bool] = Field(default=None)
    score: Optional[float] = Field(default=None)
    result_metadata: Optional[dict] = Field(default=None, sa_column=Column("metadata", JSON, nullable=True))
    latency_ms: Optional[float] = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)

    evaluation: Optional["Evaluation"] = Relationship(back_populates="results")

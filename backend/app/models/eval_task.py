import enum
import uuid
from datetime import datetime

from sqlalchemy import Column
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, SQLModel


# 任务状态枚举 / Task status enumeration
class TaskStatus(str, enum.Enum):
    """任务状态枚举 / Task status enumeration"""
    pending = "pending"       # 待处理 / Pending (waiting to run)
    running = "running"   # 运行中 / Running
    paused = "paused"     # 暂停 / Paused
    completed = "completed"  # 已完成 / Completed
    failed = "failed"     # 失败 / Failed


# 随机种子策略枚举 / Random seed strategy enumeration
class SeedStrategy(str, enum.Enum):
    """随机种子策略枚举 / Random seed strategy enumeration"""
    fixed = "fixed"     # 固定种子 / Fixed seed (same random seed each run)
    random = "random"   # 随机种子 / Random seed (different each run)


class EvalTask(SQLModel, table=True):
    """
    评估任务模型 / Evaluation task model

    存储评估任务的配置和状态信息。
    Stores evaluation task configuration and status.
    """
    __tablename__ = "eval_tasks"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # 任务ID / Task unique identifier

    name: str = Field(max_length=256)
    # 任务名称 / Task name

    status: TaskStatus = Field(
        sa_column=Column(SAEnum(TaskStatus), nullable=False, default=TaskStatus.pending)
    # 任务状态 / Task status (pending/running/paused/completed/failed)

    model_id: uuid.UUID = Field(foreign_key="llm_models.id")
    # 模型ID / Model ID (foreign key to llm_models)

    dataset_ids: str = Field(default="")  # comma-separated UUIDs
    # 数据集ID列表 / Dataset IDs (comma-separated UUIDs)

    criteria_ids: str = Field(default="")  # comma-separated UUIDs
    # 标准ID列表 / Criterion IDs (comma-separated UUIDs)

    params_json: str = Field(default='{"temperature": 0.7, "max_tokens": 1024}')
    # 参数JSON / Parameters JSON (temperature, max_tokens, etc)

    repeat_count: int = Field(default=1)
    # 重复次数 / Repeat count (for stability testing)

    seed_strategy: SeedStrategy = Field(
        sa_column=Column(SAEnum(SeedStrategy), nullable=False, default=SeedStrategy.fixed)
    )
    # 种子策略 / Seed strategy (fixed/random)

    created_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    # 创建者ID / Creator user ID (foreign key to users)

    started_at: datetime | None = Field(default=None)
    # 开始时间 / Start timestamp

    finished_at: datetime | None = Field(default=None)
    # 完成时间 / Finish timestamp

    created_at: datetime = Field(default_factory=datetime.utcnow)
    # 创建时间 / Creation timestamp

    updated_at: datetime = Field(default_factory=datetime.utcnow)
    # 更新时间 / Last update timestamp


class EvalSubtask(SQLModel, table=True):
    """
    评估子任务模型 / Evaluation subtask model

    存储评估任务的子任务信息，用于跟踪进度和恢复。
    Stores subtask information for progress tracking and resume capability.
    """
    __tablename__ = "eval_subtasks"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # 子任务ID / Subtask unique identifier

    task_id: uuid.UUID = Field(foreign_key="eval_tasks.id")
    # 父任务ID / Parent task ID (foreign key to eval_tasks)

    run_index: int = Field(default=0)
    # 运行索引 / Run index (for repeat_count > 1)

    status: TaskStatus = Field(
        sa_column=Column(
            SAEnum(TaskStatus, name="subtaskstatus", create_constraint=False),
            nullable=False,
            default=TaskStatus.pending,
        )
    )
    # 子任务状态 / Subtask status

    progress_pct: float = Field(default=0.0)
    # 进度百分比 / Progress percentage (0-100)

    last_completed_index: int = Field(default=0)
    # 最后完成的索引 / Last completed prompt index (for resume)

    error_log: str = Field(default="")
    # 错误日志 / Error log (if failed)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    # 创建时间 / Creation timestamp

    updated_at: datetime = Field(default_factory=datetime.utcnow)
    # 更新时间 / Update timestamp
import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel


class EvalResult(SQLModel, table=True):
    """
    评估结果模型 / Evaluation result model

    存储每次评估的详细结果，包括 prompt、输出和评分。
    Stores detailed evaluation results including prompt, output, and scores.
    """
    __tablename__ = "eval_results"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # 结果ID / Result unique identifier

    task_id: uuid.UUID = Field(foreign_key="eval_tasks.id", index=True)
    # 任务ID / Task ID (foreign key to eval_tasks, indexed)

    subtask_id: uuid.UUID = Field(foreign_key="eval_subtasks.id")
    # 子任务ID / Subtask ID (foreign key to eval_subtasks)

    dataset_id: uuid.UUID = Field(foreign_key="datasets.id")
    # 数据集ID / Dataset ID (foreign key to datasets)

    criterion_id: uuid.UUID = Field(foreign_key="criteria.id")
    # 评估标准ID / Criterion ID (foreign key to criteria)

    prompt_text: str = Field(default="")
    # 输入提示 / Input prompt text

    expected_output: str = Field(default="")
    # 期望输出 / Expected output (ground truth)

    model_output: str = Field(default="")
    # 模型输出 / Model generated output

    score: float = Field(default=0.0)
    # 评分 / Score (based on criterion)

    latency_ms: float = Field(default=0.0)
    # 延迟(毫秒) / Latency in milliseconds

    tokens_generated: int = Field(default=0)
    # 生成的token数 / Number of tokens generated

    first_token_ms: float = Field(default=0.0)
    # 首个token延迟(毫秒) / Time to first token in milliseconds

    created_at: datetime = Field(default_factory=datetime.utcnow)
    # 创建时间 / Creation timestamp
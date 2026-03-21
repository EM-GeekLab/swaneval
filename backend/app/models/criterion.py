import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, SQLModel


# 评估标准类型枚举 / Evaluation criterion type enumeration
class CriterionType(str, enum.Enum):
    """评估标准类型枚举 / Evaluation criterion type enumeration"""
    preset = "preset"       # 预设指标 / Preset metric (exact_match, perplexity, bleu, rouge, etc)
    regex = "regex"         # 正则表达式匹配 / Regular expression matching
    sandbox = "sandbox"     # 沙箱执行 / Sandboxed code execution
    llm_judge = "llm_judge" # LLM作为评判者 / LLM-as-a-judge evaluation


class Criterion(SQLModel, table=True):
    """
    评估标准模型 / Evaluation criterion model

    存储评估标准的配置信息，用于评估LLM输出质量。
    Stores evaluation criterion configuration for assessing LLM output quality.
    """
    __tablename__ = "criteria"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # 标准ID / Criterion unique identifier

    name: str = Field(index=True, max_length=256)
    # 标准名称 / Criterion name (indexed)

    type: CriterionType = Field(sa_column=Column(SAEnum(CriterionType), nullable=False))
    # 标准类型 / Criterion type (preset/regex/script/llm_judge)

    config_json: str = Field(default="{}")
    # 配置JSON / Configuration JSON (type-specific settings)

    created_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    # 创建者ID / Creator user ID (foreign key to users)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
    # 创建时间 / Creation timestamp

    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
    # 更新时间 / Last update timestamp


class JudgeTemplate(SQLModel, table=True):
    """Reusable LLM judge prompt templates."""
    __tablename__ = "judge_templates"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True, max_length=256)
    description: str = Field(default="")
    system_prompt: str = Field(default="")
    dimensions: str = Field(default="[]")  # JSON array of {name, weight, rubric}
    scale: int = Field(default=10)
    is_builtin: bool = Field(default=False)
    created_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
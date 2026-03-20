import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel


class ExternalBenchmark(SQLModel, table=True):
    """
    外部基准测试数据 / External benchmark data

    存储从开源测试平台拉取的闭源模型评测数据（如 GPT-4、Claude、Gemini 等），
    用于与本地私有模型结果进行对比。
    Stores benchmark results for models that cannot be locally deployed,
    pulled from public benchmark platforms for comparison.
    """
    __tablename__ = "external_benchmarks"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    model_name: str = Field(index=True, max_length=256)
    # 模型名称 / Model name (e.g. "GPT-4o", "Claude 3.5 Sonnet")

    provider: str = Field(default="")
    # 提供商 / Provider (e.g. "OpenAI", "Anthropic", "Google")

    benchmark_name: str = Field(max_length=256)
    # 基准测试名称 / Benchmark name (e.g. "MMLU", "HumanEval", "GSM8K")

    score: float = Field(default=0.0)
    # 得分（0-1 范围）/ Score (0-1 range)

    score_display: str = Field(default="")
    # 原始得分显示 / Original score display (e.g. "86.5%", "92.1")

    source_url: str = Field(default="")
    # 数据来源 URL / Source URL

    source_platform: str = Field(default="")
    # 来源平台 / Source platform (e.g. "Open LLM Leaderboard", "lmsys")

    notes: str = Field(default="")
    # 备注 / Notes

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, SQLModel


# 模型类型枚举 / Model type enumeration
class ModelType(str, enum.Enum):
    """模型类型枚举 / Model type enumeration"""
    api = "api"
    local = "local"
    huggingface = "huggingface"
    modelscope = "modelscope"


class ApiFormat(str, enum.Enum):
    """API 协议格式 / API protocol format"""
    openai = "openai"
    anthropic = "anthropic"


class LLMModel(SQLModel, table=True):
    """
    LLM模型 / Large Language Model

    存储已注册的LLM模型信息，用于评估任务。
    Stores registered LLM model information for evaluation tasks.
    """
    __tablename__ = "llm_models"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # 模型ID / Model unique identifier

    name: str = Field(index=True, max_length=256)
    # 模型名称 / Model name (indexed)

    provider: str = Field(max_length=64)
    # 模型提供商 / Model provider (e.g., OpenAI, Anthropic, local)

    endpoint_url: str
    # 端点URL / API endpoint URL or model path

    api_key: str = Field(default="")
    # API密钥 / API key for authentication (can be empty for local models)

    model_type: ModelType = Field(sa_column=Column(SAEnum(ModelType), nullable=False))
    # 模型类型 / Model type (api/local/huggingface)

    api_format: ApiFormat = Field(
        sa_column=Column(SAEnum(ApiFormat), nullable=False, server_default="openai")
    )
    # API 协议格式 / openai or anthropic

    description: str = Field(default="")
    # 模型描述 / Human-readable model description

    model_name: str = Field(default="")
    # 实际调用模型名 / Upstream provider model name

    max_tokens: int | None = Field(default=None)
    # 模型 token 上限 / Optional model token limit

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

    # ── Deployment & Status Fields ──
    deploy_status: str = Field(default="")
    # 部署状态: "", "deploying", "running", "stopped", "failed"

    cluster_id: uuid.UUID | None = Field(default=None, foreign_key="compute_clusters.id")
    # 部署到的集群ID

    source_model_id: str = Field(default="")
    # HuggingFace/ModelScope model ID for import metadata

    last_test_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    # 上次测试时间

    last_test_ok: bool | None = Field(default=None)
    # 上次测试结果
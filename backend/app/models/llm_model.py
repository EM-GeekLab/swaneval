import enum
import uuid
from datetime import datetime

from sqlalchemy import Column
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, SQLModel


# 模型类型枚举 / Model type enumeration
class ModelType(str, enum.Enum):
    """模型类型枚举 / Model type enumeration"""
    api = "api"           # API 类型模型 / API-based model (e.g., OpenAI, Anthropic)
    local = "local"       # 本地部署模型 / Locally deployed model (e.g., vLLM, Ollama)
    huggingface = "huggingface"  # HuggingFace Hub 模型 / HuggingFace Hub model


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

    created_at: datetime = Field(default_factory=datetime.utcnow)
    # 创建时间 / Creation timestamp

    updated_at: datetime = Field(default_factory=datetime.utcnow)
    # 更新时间 / Last update timestamp
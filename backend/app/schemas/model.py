import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.llm_model import ApiFormat, ModelType


class LLMModelCreate(BaseModel):
    name: str
    provider: str
    endpoint_url: str
    api_key: str = ""
    model_type: ModelType
    api_format: ApiFormat = ApiFormat.openai
    description: str = ""
    model_name: str = ""
    max_tokens: int | None = None
    source_model_id: str = ""


class LLMModelUpdate(BaseModel):
    name: str | None = None
    endpoint_url: str | None = None
    api_key: str | None = None
    api_format: ApiFormat | None = None
    description: str | None = None
    model_name: str | None = None
    max_tokens: int | None = None


class LLMModelResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    provider: str
    endpoint_url: str
    model_type: ModelType
    api_format: ApiFormat
    description: str
    model_name: str
    max_tokens: int | None
    created_at: datetime
    deploy_status: str = ""
    cluster_id: uuid.UUID | None = None
    source_model_id: str = ""
    last_test_at: datetime | None = None
    last_test_ok: bool | None = None


class ModelTestResponse(BaseModel):
    ok: bool
    message: str


class PlaygroundRequest(BaseModel):
    prompt: str
    temperature: float = 0.7
    max_tokens: int = 2048


class PlaygroundResponse(BaseModel):
    output: str
    latency_ms: float
    tokens_generated: int
    model_name: str

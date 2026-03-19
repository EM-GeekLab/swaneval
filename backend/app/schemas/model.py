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


class LLMModelUpdate(BaseModel):
    name: str | None = None
    endpoint_url: str | None = None
    api_key: str | None = None
    api_format: ApiFormat | None = None
    description: str | None = None
    model_name: str | None = None
    max_tokens: int | None = None


class LLMModelResponse(BaseModel):
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


class ModelTestResponse(BaseModel):
    ok: bool
    message: str

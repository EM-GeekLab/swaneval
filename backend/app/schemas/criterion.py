import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.criterion import CriterionType


class CriterionCreate(BaseModel):
    name: str
    type: CriterionType
    config_json: str = "{}"


class CriterionUpdate(BaseModel):
    name: str | None = None
    config_json: str | None = None


class CriterionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    type: CriterionType
    config_json: str
    created_at: datetime


class CriterionTestRequest(BaseModel):
    criterion_id: uuid.UUID
    prompt: str
    expected: str
    actual: str

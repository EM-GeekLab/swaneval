import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.models import MLModel, ModelSourceType
from app.db.session import get_session

router = APIRouter(prefix="/models", tags=["models"])


# ---------- Schemas ----------


class ModelCreate(BaseModel):
    name: str
    source_type: ModelSourceType
    path_or_endpoint: str
    revision: str | None = None
    precision: str | None = None
    device_map: str | None = None
    api_key: str | None = None
    extra_params: dict | None = None

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Qwen-7B",
                "source_type": "huggingface",
                "path_or_endpoint": "Qwen/Qwen-7B",
                "revision": "main",
                "precision": "fp16",
            }
        }
    }


class ModelRead(BaseModel):
    id: uuid.UUID
    name: str
    source_type: ModelSourceType
    path_or_endpoint: str
    revision: str | None
    precision: str | None
    device_map: str | None
    api_key: str | None
    extra_params: dict | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ModelUpdate(BaseModel):
    name: str | None = None
    source_type: ModelSourceType | None = None
    path_or_endpoint: str | None = None
    revision: str | None = None
    precision: str | None = None
    device_map: str | None = None
    api_key: str | None = None
    extra_params: dict | None = None


# ---------- Endpoints ----------


@router.post("", response_model=ModelRead, status_code=status.HTTP_201_CREATED)
async def create_model(payload: ModelCreate, session: AsyncSession = Depends(get_session)):
    model = MLModel(**payload.model_dump())
    session.add(model)
    await session.commit()
    await session.refresh(model)
    return model


@router.get("", response_model=list[ModelRead])
async def list_models(
    skip: int = 0,
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(MLModel).order_by(MLModel.created_at.desc()).offset(skip).limit(limit)  # type: ignore[attr-defined]
    )
    return result.all()


@router.get("/{model_id}", response_model=ModelRead)
async def get_model(model_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    model = await session.get(MLModel, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return model


@router.patch("/{model_id}", response_model=ModelRead)
async def update_model(
    model_id: uuid.UUID,
    payload: ModelUpdate,
    session: AsyncSession = Depends(get_session),
):
    model = await session.get(MLModel, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(model, key, value)
    model.updated_at = datetime.now(timezone.utc)
    session.add(model)
    await session.commit()
    await session.refresh(model)
    return model


@router.delete("/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(model_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    model = await session.get(MLModel, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    await session.delete(model)
    await session.commit()

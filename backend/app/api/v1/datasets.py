import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.models import Dataset, DatasetSourceType
from app.db.session import get_session

router = APIRouter(prefix="/datasets", tags=["datasets"])


# ---------- Schemas ----------


class DatasetCreate(BaseModel):
    name: str
    source_type: DatasetSourceType
    source_path: str
    description: str | None = None
    version: str = "1.0"
    row_count: int | None = None
    schema_info: dict | None = None


class DatasetRead(BaseModel):
    id: uuid.UUID
    name: str
    source_type: DatasetSourceType
    source_path: str
    description: str | None
    version: str
    row_count: int | None
    schema_info: dict | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DatasetUpdate(BaseModel):
    name: str | None = None
    source_type: DatasetSourceType | None = None
    source_path: str | None = None
    description: str | None = None
    version: str | None = None
    row_count: int | None = None
    schema_info: dict | None = None


class DatasetVersionCreate(BaseModel):
    version: str


# ---------- Endpoints ----------


@router.post("", response_model=DatasetRead, status_code=status.HTTP_201_CREATED)
async def create_dataset(payload: DatasetCreate, session: AsyncSession = Depends(get_session)):
    dataset = Dataset(**payload.model_dump())
    session.add(dataset)
    await session.commit()
    await session.refresh(dataset)
    return dataset


@router.get("", response_model=list[DatasetRead])
async def list_datasets(
    skip: int = 0,
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Dataset).order_by(Dataset.created_at.desc()).offset(skip).limit(limit)  # type: ignore[attr-defined]
    )
    return result.all()


@router.get("/{dataset_id}", response_model=DatasetRead)
async def get_dataset(dataset_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    dataset = await session.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.get("/{dataset_id}/preview")
async def preview_dataset(dataset_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    dataset = await session.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {
        "id": dataset.id,
        "name": dataset.name,
        "version": dataset.version,
        "row_count": dataset.row_count,
        "schema_info": dataset.schema_info,
    }


@router.post("/{dataset_id}/version", response_model=DatasetRead)
async def create_dataset_version(
    dataset_id: uuid.UUID,
    payload: DatasetVersionCreate,
    session: AsyncSession = Depends(get_session),
):
    original = await session.get(Dataset, dataset_id)
    if not original:
        raise HTTPException(status_code=404, detail="Dataset not found")
    new_dataset = Dataset(
        name=original.name,
        source_type=original.source_type,
        source_path=original.source_path,
        description=original.description,
        row_count=original.row_count,
        schema_info=original.schema_info,
        version=payload.version,
    )
    session.add(new_dataset)
    await session.commit()
    await session.refresh(new_dataset)
    return new_dataset


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(dataset_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    dataset = await session.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    await session.delete(dataset)
    await session.commit()

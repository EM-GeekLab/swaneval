"""Dataset management endpoints."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.database import get_db
from app.db.models import Dataset, DatasetSource
from app.security import get_current_user

router = APIRouter()


# Pydantic models
class DatasetCreate(SQLModel):
    """Dataset create model."""
    name: str
    source: str  # preset, huggingface, custom, server_path
    path: str
    tags: Optional[List[str]] = None
    extra_metadata: Optional[dict] = None


class DatasetResponse(SQLModel):
    """Dataset response model."""
    id: int
    name: str
    source: str
    path: str
    version: int
    tags: Optional[List[str]] = None
    extra_metadata: Optional[dict] = None
    row_count: Optional[int] = None
    created_at: str


# Preset datasets (built-in EvalScope datasets)
PRESET_DATASETS = [
    {"id": -1, "name": "MMLU", "source": "preset", "path": "mmlu", "tags": ["knowledge", "reasoning"]},
    {"id": -2, "name": "C-Eval", "source": "preset", "path": "ceval", "tags": ["knowledge", "reasoning"]},
    {"id": -3, "name": "GSM8K", "source": "preset", "path": "gsm8k", "tags": ["math", "reasoning"]},
    {"id": -4, "name": "MATH", "source": "preset", "path": "math", "tags": ["math"]},
    {"id": -5, "name": "ARC", "source": "preset", "path": "arc", "tags": ["reasoning"]},
    {"id": -6, "name": "BBH", "source": "preset", "path": "bbh", "tags": ["reasoning"]},
    {"id": -7, "name": "HumanEval", "source": "preset", "path": "humaneval", "tags": ["code"]},
    {"id": -8, "name": "MBPP", "source": "preset", "path": "mbpp", "tags": ["code"]},
    {"id": -9, "name": "AlpacaEval", "source": "preset", "path": "alpaca_eval", "tags": ["instruction"]},
    {"id": -10, "name": "MT-Bench", "source": "preset", "path": "mt_bench", "tags": ["instruction"]},
    {"id": -11, "name": "LongBench", "source": "preset", "path": "longbench", "tags": ["long_context"]},
]


@router.get("", response_model=List[DatasetResponse])
async def list_datasets(
    skip: int = 0,
    limit: int = 100,
    tags: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all datasets."""
    result = await db.exec(select(Dataset).offset(skip).limit(limit))
    user_datasets = result.all()

    all_datasets = []

    for d in PRESET_DATASETS:
        if tags:
            d_tags = d.get("tags", [])
            if not any(t in d_tags for t in tags.split(",")):
                continue
        all_datasets.append(DatasetResponse(
            id=d["id"],
            name=d["name"],
            source=d["source"],
            path=d["path"],
            version=1,
            tags=d.get("tags"),
            extra_metadata=None,
            row_count=None,
            created_at="2024-01-01T00:00:00"
        ))

    for d in user_datasets:
        if tags:
            d_tags = d.tags or []
            if not any(t in d_tags for t in tags.split(",")):
                continue
        all_datasets.append(DatasetResponse(
            id=d.id,
            name=d.name,
            source=d.source,
            path=d.path,
            version=d.version,
            tags=d.tags,
            extra_metadata=d.dataset_metadata,
            row_count=d.row_count,
            created_at=d.created_at.isoformat()
        ))

    return all_datasets


@router.get("/presets", response_model=List[dict])
async def list_preset_datasets(
    tags: Optional[str] = None,
):
    """List preset datasets."""
    datasets = PRESET_DATASETS
    if tags:
        datasets = [d for d in datasets if any(t in d.get("tags", []) for t in tags.split(","))]
    return [{"id": d["id"], "name": d["name"], "path": d["path"], "tags": d.get("tags")} for d in datasets]


@router.post("", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def create_dataset(
    dataset: DatasetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a new dataset."""
    db_dataset = Dataset(
        name=dataset.name,
        source=DatasetSource(dataset.source),
        path=dataset.path,
        tags=dataset.tags,
        dataset_metadata=dataset.extra_metadata,
        created_by=current_user["id"],
    )
    db.add(db_dataset)
    await db.commit()
    await db.refresh(db_dataset)

    return DatasetResponse(
        id=db_dataset.id,
        name=db_dataset.name,
        source=db_dataset.source,
        path=db_dataset.path,
        version=db_dataset.version,
        tags=db_dataset.tags,
        extra_metadata=db_dataset.dataset_metadata,
        row_count=db_dataset.row_count,
        created_at=db_dataset.created_at.isoformat()
    )


@router.post("/upload", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = File(...),
    name: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Upload a custom dataset file."""
    import os
    import aiofiles

    upload_dir = "./uploads"
    os.makedirs(upload_dir, exist_ok=True)

    file_path = os.path.join(upload_dir, file.filename)
    async with aiofiles.open(file_path, 'wb') as f:
        content = await file.read()
        await f.write(content)

    dataset_name = name or file.filename.split('.')[0]
    db_dataset = Dataset(
        name=dataset_name,
        source=DatasetSource.CUSTOM,
        path=file_path,
        tags=["custom"],
        created_by=current_user["id"],
    )
    db.add(db_dataset)
    await db.commit()
    await db.refresh(db_dataset)

    return DatasetResponse(
        id=db_dataset.id,
        name=db_dataset.name,
        source=db_dataset.source,
        path=db_dataset.path,
        version=db_dataset.version,
        tags=db_dataset.tags,
        extra_metadata=db_dataset.dataset_metadata,
        row_count=db_dataset.row_count,
        created_at=db_dataset.created_at.isoformat()
    )


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get a dataset by ID."""
    for d in PRESET_DATASETS:
        if d["id"] == dataset_id:
            return DatasetResponse(
                id=d["id"],
                name=d["name"],
                source=d["source"],
                path=d["path"],
                version=1,
                tags=d.get("tags"),
                extra_metadata=None,
                row_count=None,
                created_at="2024-01-01T00:00:00"
            )

    dataset = await db.get(Dataset, dataset_id)

    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    return DatasetResponse(
        id=dataset.id,
        name=dataset.name,
        source=dataset.source,
        path=dataset.path,
        version=dataset.version,
        tags=dataset.tags,
        extra_metadata=dataset.dataset_metadata,
        row_count=dataset.row_count,
        created_at=dataset.created_at.isoformat()
    )


@router.get("/{dataset_id}/preview")
async def preview_dataset(
    dataset_id: int,
    limit: int = 5,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Preview dataset content."""
    for d in PRESET_DATASETS:
        if d["id"] == dataset_id:
            return {
                "dataset_id": dataset_id,
                "name": d["name"],
                "sample_count": "See EvalScope documentation",
                "columns": ["question", "answer", "options"] if d["name"] in ["MMLU", "C-Eval"] else ["question", "answer"]
            }

    dataset = await db.get(Dataset, dataset_id)

    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    return {
        "dataset_id": dataset.id,
        "name": dataset.name,
        "path": dataset.path,
        "version": dataset.version,
    }

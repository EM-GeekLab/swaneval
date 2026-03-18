import json
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_user, get_db
from app.config import settings
from app.models.dataset import Dataset, DatasetVersion, SourceType
from app.models.user import User
from app.schemas.dataset import DatasetMountRequest, DatasetResponse
from app.services.dataset_deletion import cleanup_uploaded_file, delete_dataset_versions

router = APIRouter()


def _count_rows(file_path: str) -> int:
    """Count rows in a JSONL/JSON file."""
    if not os.path.exists(file_path):
        return 0
    count = 0
    with open(file_path) as f:
        if file_path.endswith(".json"):
            data = json.load(f)
            return len(data) if isinstance(data, list) else 1
        for line in f:
            if line.strip():
                count += 1
    return count


@router.post("/upload", response_model=DatasetResponse, status_code=201)
async def upload_dataset(
    file: UploadFile,
    name: str = "",
    description: str = "",
    tags: str = "",
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not name:
        name = file.filename or "untitled"

    ext = os.path.splitext(file.filename or "")[1].lower()
    fmt = ext.lstrip(".") or "jsonl"

    # Save file
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_id = uuid.uuid4()
    file_path = os.path.join(settings.UPLOAD_DIR, f"{file_id}{ext}")
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    row_count = _count_rows(file_path)

    # Check if dataset with same name exists (auto-version)
    stmt = select(Dataset).where(Dataset.name == name).order_by(Dataset.version.desc())
    existing = (await session.exec(stmt)).first()
    version = (existing.version + 1) if existing else 1

    ds = Dataset(
        name=name,
        description=description,
        source_type=SourceType.upload,
        source_uri=file_path,
        format=fmt,
        tags=tags,
        version=version,
        size_bytes=len(content),
        row_count=row_count,
        created_by=current_user.id,
    )
    session.add(ds)
    await session.commit()
    await session.refresh(ds)

    # Create version record
    dv = DatasetVersion(
        dataset_id=ds.id,
        version=version,
        file_path=file_path,
        changelog="Initial upload" if version == 1 else f"Version {version}",
        row_count=row_count,
    )
    session.add(dv)
    await session.commit()

    return ds


@router.post("/mount", response_model=DatasetResponse, status_code=201)
async def mount_dataset(
    body: DatasetMountRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not os.path.exists(body.server_path):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Server path does not exist")

    row_count = _count_rows(body.server_path)
    size = os.path.getsize(body.server_path)

    ds = Dataset(
        name=body.name,
        description=body.description,
        source_type=SourceType.server_path,
        source_uri=body.server_path,
        format=body.format,
        tags=body.tags,
        version=1,
        size_bytes=size,
        row_count=row_count,
        created_by=current_user.id,
    )
    session.add(ds)
    await session.commit()
    await session.refresh(ds)
    return ds


@router.get("", response_model=list[DatasetResponse])
async def list_datasets(
    page: int = 1,
    page_size: int = 20,
    tag: str | None = None,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Dataset)
    if tag:
        stmt = stmt.where(Dataset.tags.contains(tag))
    stmt = stmt.order_by(Dataset.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await session.exec(stmt)
    return result.all()


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ds = await session.get(Dataset, dataset_id)
    if not ds:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dataset not found")
    return ds


@router.get("/{dataset_id}/preview")
async def preview_dataset(
    dataset_id: uuid.UUID,
    limit: int = 50,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ds = await session.get(Dataset, dataset_id)
    if not ds:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dataset not found")

    rows = []
    if not os.path.exists(ds.source_uri):
        return {"rows": [], "total": 0}

    with open(ds.source_uri) as f:
        if ds.source_uri.endswith(".json"):
            data = json.load(f)
            items = data if isinstance(data, list) else [data]
            rows = items[:limit]
        else:
            for i, line in enumerate(f):
                if i >= limit:
                    break
                line = line.strip()
                if line:
                    rows.append(json.loads(line))

    return {"rows": rows, "total": ds.row_count}


@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(
    dataset_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ds = await session.get(Dataset, dataset_id)
    if not ds:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dataset not found")

    await delete_dataset_versions(session, ds.id)
    cleanup_uploaded_file(ds)
    await session.delete(ds)
    await session.commit()

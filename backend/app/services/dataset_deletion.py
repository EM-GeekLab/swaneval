"""Dataset deletion helpers to keep API layer thin and testable."""

from __future__ import annotations

import os
import uuid

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.dataset import Dataset, DatasetVersion, SourceType


def cleanup_uploaded_file(dataset: Dataset) -> bool:
    """Delete uploaded dataset file if it exists.

    Returns True only when a file is actually removed.
    """
    if dataset.source_type != SourceType.upload:
        return False
    if not dataset.source_uri:
        return False
    if not os.path.exists(dataset.source_uri):
        return False

    try:
        os.remove(dataset.source_uri)
        return True
    except OSError:
        return False


async def delete_dataset_versions(session: AsyncSession, dataset_id: uuid.UUID) -> int:
    """Delete all version rows for a dataset and return deleted row count."""
    stmt = select(DatasetVersion).where(DatasetVersion.dataset_id == dataset_id)
    result = await session.exec(stmt)
    versions = result.all()
    for version in versions:
        await session.delete(version)
    return len(versions)

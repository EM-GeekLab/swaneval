"""
数据集订阅同步服务 / Dataset subscription sync service

定期检查已订阅的 HuggingFace/ModelScope 数据集是否有更新，
如果远程仓库有新提交则自动下载新版本。
Periodically check subscribed datasets for updates and auto-download new versions.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.database import engine
from app.models.dataset import Dataset, DatasetVersion, SourceType, SyncLog
from app.services.dataset_import import import_huggingface, import_modelscope
from app.services.storage import get_storage

logger = logging.getLogger(__name__)

# Global handle for the background loop so we can cancel on shutdown
_sync_task: asyncio.Task | None = None


def _get_hf_latest_sha(dataset_id: str) -> str | None:
    """Get the latest commit SHA for a HuggingFace dataset repo."""
    try:
        from huggingface_hub import repo_info
        info = repo_info(dataset_id, repo_type="dataset")
        return info.sha
    except Exception:
        return None


async def check_and_sync_dataset(
    dataset_id, triggered_by: str = "auto"
) -> str:
    """Check a single dataset for updates and sync if needed.

    Returns a status string: "synced", "up_to_date", or "failed:<reason>".
    Writes a SyncLog record for every check.
    """
    import time as _time

    storage = get_storage()
    t0 = _time.monotonic()

    async with AsyncSession(engine) as session:
        ds = await session.get(Dataset, dataset_id)
        if not ds or not ds.auto_update:
            return "skipped"

        hf_id = ds.hf_dataset_id or ds.source_uri
        if not hf_id:
            return "failed:no dataset ID"

        old_version = ds.version
        old_row_count = ds.row_count

        ds.sync_status = "syncing"
        session.add(ds)
        await session.commit()

        try:
            if ds.source_type in (SourceType.huggingface, SourceType.preset):
                latest_sha = await asyncio.to_thread(_get_hf_latest_sha, hf_id)
                if latest_sha and latest_sha == ds.hf_last_sha:
                    ds.sync_status = "synced"
                    ds.last_synced_at = datetime.now(timezone.utc)
                    session.add(ds)
                    elapsed = int((_time.monotonic() - t0) * 1000)
                    session.add(SyncLog(
                        dataset_id=ds.id, triggered_by=triggered_by,
                        status="up_to_date", old_version=old_version,
                        old_row_count=old_row_count, duration_ms=elapsed,
                    ))
                    await session.commit()
                    return "up_to_date"

                source_uri, row_count, size_bytes = await import_huggingface(
                    hf_id, ds.hf_subset, ds.hf_split, storage,
                )
                new_sha = latest_sha or ""

            elif ds.source_type == SourceType.modelscope:
                source_uri, row_count, size_bytes = await import_modelscope(
                    hf_id, ds.hf_subset, ds.hf_split, storage,
                )
                new_sha = ""

            else:
                ds.sync_status = "failed"
                session.add(ds)
                elapsed = int((_time.monotonic() - t0) * 1000)
                session.add(SyncLog(
                    dataset_id=ds.id, triggered_by=triggered_by,
                    status="failed", old_version=old_version,
                    old_row_count=old_row_count, duration_ms=elapsed,
                    error_message="unsupported source type",
                ))
                await session.commit()
                return "failed:unsupported source type"

            # Check if content actually changed
            if row_count == ds.row_count and size_bytes == ds.size_bytes:
                ds.sync_status = "synced"
                ds.last_synced_at = datetime.now(timezone.utc)
                ds.hf_last_sha = new_sha
                session.add(ds)
                elapsed = int((_time.monotonic() - t0) * 1000)
                session.add(SyncLog(
                    dataset_id=ds.id, triggered_by=triggered_by,
                    status="up_to_date", old_version=old_version,
                    old_row_count=old_row_count, duration_ms=elapsed,
                ))
                await session.commit()
                return "up_to_date"

            # Content changed — create new version
            new_version = ds.version + 1
            ds.source_uri = source_uri
            ds.row_count = row_count
            ds.size_bytes = size_bytes
            ds.version = new_version
            ds.sync_status = "synced"
            ds.last_synced_at = datetime.now(timezone.utc)
            ds.updated_at = datetime.now(timezone.utc)
            ds.hf_last_sha = new_sha
            session.add(ds)

            import os
            ext = os.path.splitext(source_uri)[1].lstrip(".")
            dv = DatasetVersion(
                dataset_id=ds.id,
                version=new_version,
                file_path=source_uri,
                changelog=f"Auto-synced: {row_count} rows ({size_bytes} bytes)",
                row_count=row_count,
                size_bytes=size_bytes,
                format=ext or "jsonl",
            )
            session.add(dv)

            elapsed = int((_time.monotonic() - t0) * 1000)
            session.add(SyncLog(
                dataset_id=ds.id, triggered_by=triggered_by,
                status="synced", old_version=old_version,
                new_version=new_version, old_row_count=old_row_count,
                new_row_count=row_count, duration_ms=elapsed,
            ))
            await session.commit()

            logger.info(
                "Dataset %s (%s) updated to v%d: %d rows",
                ds.name, hf_id, new_version, row_count,
            )
            return "synced"

        except Exception as e:
            logger.error("Failed to sync dataset %s: %s", ds.name, e)
            ds.sync_status = "failed"
            ds.last_synced_at = datetime.now(timezone.utc)
            session.add(ds)
            elapsed = int((_time.monotonic() - t0) * 1000)
            session.add(SyncLog(
                dataset_id=ds.id, triggered_by=triggered_by,
                status="failed", old_version=old_version,
                old_row_count=old_row_count, duration_ms=elapsed,
                error_message=str(e)[:500],
            ))
            await session.commit()
            return f"failed:{e}"


async def run_sync_cycle():
    """Run one cycle: check all subscribed datasets."""
    async with AsyncSession(engine) as session:
        result = await session.exec(
            select(Dataset).where(Dataset.auto_update == True)  # noqa: E712
        )
        datasets = result.all()

    now = datetime.now(timezone.utc)
    for ds in datasets:
        # Skip if checked recently (within interval)
        if ds.last_synced_at:
            next_check = ds.last_synced_at + timedelta(hours=ds.update_interval_hours)
            if now < next_check:
                continue

        try:
            status = await check_and_sync_dataset(ds.id)
            logger.info("Sync check for %s: %s", ds.name, status)
        except Exception as e:
            logger.error("Sync cycle error for %s: %s", ds.name, e)


async def sync_loop():
    """Background loop that periodically checks for dataset updates."""
    logger.info("Dataset sync loop started")
    while True:
        try:
            await run_sync_cycle()
        except Exception as e:
            logger.error("Sync cycle failed: %s", e)
        # Check every 10 minutes; individual datasets respect their own interval
        await asyncio.sleep(600)


def start_sync_loop():
    """Start the background sync loop (call from app lifespan)."""
    global _sync_task
    _sync_task = asyncio.create_task(sync_loop())


def stop_sync_loop():
    """Stop the background sync loop (call from app shutdown)."""
    global _sync_task
    if _sync_task and not _sync_task.done():
        _sync_task.cancel()
        _sync_task = None

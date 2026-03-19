"""
外部基准测试数据 API / External benchmark data API

从开源平台拉取闭源模型评测数据，用于与本地模型对比。
Import benchmark data from public platforms for comparison with local models.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.external_benchmark import ExternalBenchmark
from app.models.user import User

router = APIRouter()


class BenchmarkCreate(BaseModel):
    model_name: str
    provider: str = ""
    benchmark_name: str
    score: float
    score_display: str = ""
    source_url: str = ""
    source_platform: str = ""
    notes: str = ""


class BenchmarkBatchCreate(BaseModel):
    items: list[BenchmarkCreate]


class BenchmarkResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    model_name: str
    provider: str
    benchmark_name: str
    score: float
    score_display: str
    source_url: str
    source_platform: str
    notes: str


@router.get("", response_model=list[BenchmarkResponse])
async def list_benchmarks(
    model_name: str | None = None,
    benchmark_name: str | None = None,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List external benchmark entries with optional filters."""
    stmt = select(ExternalBenchmark)
    if model_name:
        stmt = stmt.where(ExternalBenchmark.model_name == model_name)
    if benchmark_name:
        stmt = stmt.where(
            ExternalBenchmark.benchmark_name == benchmark_name
        )
    stmt = stmt.order_by(
        ExternalBenchmark.benchmark_name,
        ExternalBenchmark.score.desc(),
    )
    result = await session.exec(stmt)
    return result.all()


@router.post("", response_model=BenchmarkResponse, status_code=201)
async def create_benchmark(
    body: BenchmarkCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a single external benchmark entry."""
    entry = ExternalBenchmark(
        model_name=body.model_name,
        provider=body.provider,
        benchmark_name=body.benchmark_name,
        score=max(0.0, min(1.0, body.score)),
        score_display=body.score_display,
        source_url=body.source_url,
        source_platform=body.source_platform,
        notes=body.notes,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


@router.post(
    "/batch", response_model=list[BenchmarkResponse], status_code=201
)
async def create_benchmarks_batch(
    body: BenchmarkBatchCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Batch import multiple external benchmark entries."""
    entries = []
    for item in body.items:
        entry = ExternalBenchmark(
            model_name=item.model_name,
            provider=item.provider,
            benchmark_name=item.benchmark_name,
            score=max(0.0, min(1.0, item.score)),
            score_display=item.score_display,
            source_url=item.source_url,
            source_platform=item.source_platform,
            notes=item.notes,
        )
        session.add(entry)
        entries.append(entry)
    await session.commit()
    for e in entries:
        await session.refresh(e)
    return entries


@router.delete("/{benchmark_id}", status_code=204)
async def delete_benchmark(
    benchmark_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = await session.get(ExternalBenchmark, benchmark_id)
    if not entry:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Benchmark entry not found"
        )
    await session.delete(entry)
    await session.commit()

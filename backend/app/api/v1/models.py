import logging
import time
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db, require_permission
from app.config import settings
from app.models.llm_model import LLMModel
from app.models.model_run_log import ModelRunLog
from app.models.user import User
from app.schemas.model import (
    LLMModelCreate,
    LLMModelResponse,
    LLMModelUpdate,
    ModelPullRequest,
    ModelPullResponse,
    ModelRunLogResponse,
    ModelSearchResponse,
    ModelTestResponse,
    PlaygroundRequest,
    PlaygroundResponse,
)
from app.services.model_connectivity import test_model_connectivity
from app.services.task_runner import ModelCallResult, _call_model

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("", response_model=LLMModelResponse, status_code=201)
async def create_model(
    body: LLMModelCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("models.write"),
):
    m = LLMModel(
        name=body.name,
        provider=body.provider,
        endpoint_url=body.endpoint_url,
        api_key=body.api_key,
        model_type=body.model_type,
        api_format=body.api_format,
        description=body.description,
        model_name=body.model_name,
        max_tokens=body.max_tokens,
    )
    session.add(m)
    await session.commit()
    await session.refresh(m)
    return m


@router.get("", response_model=list[LLMModelResponse])
async def list_models(
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("models.read"),
):
    stmt = select(LLMModel).order_by(col(LLMModel.created_at).desc())
    result = await session.exec(stmt)
    return result.all()


@router.get("/{model_id}", response_model=LLMModelResponse)
async def get_model(
    model_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("models.read"),
):
    m = await session.get(LLMModel, model_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")
    return m


@router.put("/{model_id}", response_model=LLMModelResponse)
async def update_model(
    model_id: uuid.UUID,
    body: LLMModelUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("models.write"),
):
    m = await session.get(LLMModel, model_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")
    if body.name is not None:
        m.name = body.name
    if body.endpoint_url is not None:
        m.endpoint_url = body.endpoint_url
    if body.api_key is not None:
        m.api_key = body.api_key
    if body.api_format is not None:
        m.api_format = body.api_format
    if body.description is not None:
        m.description = body.description
    if body.model_name is not None:
        m.model_name = body.model_name
    if body.max_tokens is not None:
        m.max_tokens = body.max_tokens

    m.updated_at = datetime.now(timezone.utc)
    session.add(m)
    await session.commit()
    await session.refresh(m)
    return m


@router.post("/{model_id}/test", response_model=ModelTestResponse)
async def test_model(
    model_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("models.read"),
):
    m = await session.get(LLMModel, model_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")

    model_name = m.model_name or m.name or settings.DEFAULT_MODEL_NAME
    endpoint_url = m.endpoint_url or settings.DEFAULT_MODEL_ENDPOINT_URL
    api_key = m.api_key or settings.DEFAULT_MODEL_API_KEY

    t0 = time.monotonic()
    ok, message = await test_model_connectivity(
        endpoint_url=endpoint_url,
        api_key=api_key,
        model_name=model_name,
        api_format=m.api_format or "openai",
    )
    duration_ms = int((time.monotonic() - t0) * 1000)

    m.last_test_at = datetime.now(timezone.utc)
    m.last_test_ok = ok
    session.add(m)

    log = ModelRunLog(
        model_id=m.id,
        action="test",
        status="success" if ok else "failed",
        message=message[:500],
        duration_ms=duration_ms,
        triggered_by=current_user.id,
    )
    session.add(log)
    await session.commit()

    return ModelTestResponse(ok=ok, message=message)


@router.delete("/{model_id}", status_code=204)
async def delete_model(
    model_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("models.write"),
):
    m = await session.get(LLMModel, model_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")
    try:
        await session.delete(m)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "无法删除：该模型仍被评测任务引用，请先删除相关任务。",
        )


@router.post("/{model_id}/playground", response_model=PlaygroundResponse)
async def playground(
    model_id: uuid.UUID,
    body: PlaygroundRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("models.read"),
):
    """Send a prompt to a model and get the response."""
    m = await session.get(LLMModel, model_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")

    params = {"temperature": body.temperature, "max_tokens": body.max_tokens}

    async with httpx.AsyncClient(timeout=180.0) as client:
        result: ModelCallResult = await _call_model(client, m, body.prompt, params)

    if result.error:
        raise HTTPException(400, f"Model call failed: {result.error.detail}")

    return PlaygroundResponse(
        output=result.output,
        latency_ms=result.latency_ms,
        tokens_generated=result.tokens_generated,
        model_name=m.model_name or m.name,
    )


# ── Model Pull (HF/MS) ──────────────────────────────────────────


@router.post("/pull", response_model=ModelPullResponse, status_code=201)
async def pull_model(
    body: ModelPullRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("models.write"),
):
    """Pull model metadata from HuggingFace or ModelScope and register it."""
    from app.services.model_registry import fetch_hf_model_info, fetch_ms_model_info

    t0 = time.monotonic()
    source = body.source or "huggingface"

    if source == "huggingface":
        token = body.token or settings.HF_TOKEN
        info = await fetch_hf_model_info(body.model_id, hf_token=token)
    elif source == "modelscope":
        token = body.token or settings.MS_TOKEN
        info = await fetch_ms_model_info(body.model_id, ms_token=token)
    else:
        raise HTTPException(400, f"Unsupported source: {source}")

    # Create model entry
    model_type = "huggingface" if source == "huggingface" else "modelscope"
    m = LLMModel(
        name=body.name or info["name"],
        provider=info["provider"],
        endpoint_url=body.endpoint_url or "",
        api_key=body.api_key or "",
        model_type=model_type,
        api_format="openai",
        description=info["description"],
        model_name=info["model_name"],
        source_model_id=info["source_model_id"],
    )
    session.add(m)
    await session.commit()
    await session.refresh(m)

    duration_ms = int((time.monotonic() - t0) * 1000)
    log = ModelRunLog(
        model_id=m.id,
        action=f"pull_{source[:2]}",
        status="success",
        message=f"Pulled {info['source_model_id']} from {source}",
        duration_ms=duration_ms,
        triggered_by=current_user.id,
    )
    session.add(log)
    await session.commit()

    return ModelPullResponse(
        model=LLMModelResponse.model_validate(m),
        source=source,
        source_model_id=info["source_model_id"],
        metadata={
            "pipeline_tag": info.get("pipeline_tag", ""),
            "downloads": info.get("downloads", 0),
            "likes": info.get("likes", 0),
            "tags": info.get("tags", []),
        },
    )


@router.get("/search", response_model=list[ModelSearchResponse])
async def search_models_hub(
    q: str = Query(..., min_length=1, description="Search query"),
    source: str = Query("huggingface", description="huggingface or modelscope"),
    limit: int = Query(20, ge=1, le=50),
    current_user: User = require_permission("models.read"),
):
    """Search HuggingFace/ModelScope for models."""
    from app.services.model_registry import search_hf_models

    if source == "huggingface":
        results = await search_hf_models(q, limit=limit, hf_token=settings.HF_TOKEN)
    else:
        raise HTTPException(400, "Only HuggingFace search is currently supported")

    return [
        ModelSearchResponse(
            model_id=r["model_id"],
            downloads=r.get("downloads", 0),
            likes=r.get("likes", 0),
            pipeline_tag=r.get("pipeline_tag", ""),
        )
        for r in results
    ]


# ── Model Run Logs ───────────────────────────────────────────────


@router.get("/{model_id}/logs", response_model=list[ModelRunLogResponse])
async def get_model_logs(
    model_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("models.read"),
):
    """Get run logs for a model (pull, test, deploy actions)."""
    m = await session.get(LLMModel, model_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")

    stmt = (
        select(ModelRunLog)
        .where(ModelRunLog.model_id == model_id)
        .order_by(col(ModelRunLog.created_at).desc())
        .limit(limit)
    )
    result = await session.exec(stmt)
    return result.all()

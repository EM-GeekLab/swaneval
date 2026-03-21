import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_user, get_db
from app.config import settings
from app.models.llm_model import LLMModel
from app.models.user import User
from app.schemas.model import (
    LLMModelCreate,
    LLMModelResponse,
    LLMModelUpdate,
    ModelTestResponse,
    PlaygroundRequest,
    PlaygroundResponse,
)
from app.services.model_connectivity import test_model_connectivity
from app.services.task_runner import ModelCallResult, _call_model

router = APIRouter()


@router.post("", response_model=LLMModelResponse, status_code=201)
async def create_model(
    body: LLMModelCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
):
    stmt = select(LLMModel).order_by(col(LLMModel.created_at).desc())
    result = await session.exec(stmt)
    return result.all()


@router.get("/{model_id}", response_model=LLMModelResponse)
async def get_model(
    model_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
):
    m = await session.get(LLMModel, model_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")

    model_name = m.model_name or m.name or settings.DEFAULT_MODEL_NAME
    endpoint_url = m.endpoint_url or settings.DEFAULT_MODEL_ENDPOINT_URL
    api_key = m.api_key or settings.DEFAULT_MODEL_API_KEY
    ok, message = await test_model_connectivity(
        endpoint_url=endpoint_url,
        api_key=api_key,
        model_name=model_name,
        api_format=m.api_format or "openai",
    )

    m.last_test_at = datetime.now(timezone.utc)
    m.last_test_ok = ok
    session.add(m)
    await session.commit()

    return ModelTestResponse(ok=ok, message=message)


@router.delete("/{model_id}", status_code=204)
async def delete_model(
    model_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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

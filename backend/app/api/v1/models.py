import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.llm_model import LLMModel
from app.models.user import User
from app.schemas.model import LLMModelCreate, LLMModelResponse, LLMModelUpdate

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
    stmt = select(LLMModel).order_by(LLMModel.created_at.desc())
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
    session.add(m)
    await session.commit()
    await session.refresh(m)
    return m


@router.post("/{model_id}/test")
async def test_model_endpoint(
    model_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = await session.get(LLMModel, model_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")
    try:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if m.api_key:
            headers["Authorization"] = f"Bearer {m.api_key}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                m.endpoint_url,
                headers=headers,
                json={
                    "model": m.name,
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 1,
                },
            )
        if resp.status_code < 400:
            return {"ok": True, "message": f"Connected ({resp.status_code})"}
        return {"ok": False, "message": f"HTTP {resp.status_code}"}
    except httpx.TimeoutException:
        return {"ok": False, "message": "Connection timed out"}
    except Exception as e:
        return {"ok": False, "message": str(e)[:200]}


@router.delete("/{model_id}", status_code=204)
async def delete_model(
    model_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = await session.get(LLMModel, model_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")
    await session.delete(m)
    await session.commit()

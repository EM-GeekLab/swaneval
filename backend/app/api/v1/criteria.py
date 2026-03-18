import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.criterion import Criterion
from app.models.eval_result import EvalResult
from app.models.user import User
from app.schemas.criterion import (
    CriterionCreate,
    CriterionResponse,
    CriterionTestRequest,
    CriterionUpdate,
)
from app.services.evaluators import run_criterion

router = APIRouter()


@router.post("", response_model=CriterionResponse, status_code=201)
async def create_criterion(
    body: CriterionCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = Criterion(
        name=body.name,
        type=body.type,
        config_json=body.config_json,
        created_by=current_user.id,
    )
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return c


@router.get("", response_model=list[CriterionResponse])
async def list_criteria(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Criterion).order_by(Criterion.created_at.desc())
    result = await session.exec(stmt)
    return result.all()


@router.get("/{criterion_id}", response_model=CriterionResponse)
async def get_criterion(
    criterion_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = await session.get(Criterion, criterion_id)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Criterion not found")
    return c


@router.put("/{criterion_id}", response_model=CriterionResponse)
async def update_criterion(
    criterion_id: uuid.UUID,
    body: CriterionUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = await session.get(Criterion, criterion_id)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Criterion not found")
    if body.name is not None:
        c.name = body.name
    if body.config_json is not None:
        c.config_json = body.config_json
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return c


@router.delete("/{criterion_id}", status_code=204)
async def delete_criterion(
    criterion_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = await session.get(Criterion, criterion_id)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Criterion not found")

    # Delete eval_results referencing this criterion
    stmt = select(EvalResult).where(EvalResult.criterion_id == criterion_id)
    results = (await session.exec(stmt)).all()
    for r in results:
        await session.delete(r)

    await session.delete(c)
    await session.commit()


@router.post("/test")
async def test_criterion(
    body: CriterionTestRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = await session.get(Criterion, body.criterion_id)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Criterion not found")

    score = run_criterion(c.type, c.config_json, body.expected, body.actual)
    return {"score": score, "criterion": c.name, "type": c.type}

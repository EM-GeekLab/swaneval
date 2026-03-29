import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db, require_permission
from app.models.criterion import Criterion
from app.models.eval_result import EvalResult
from app.models.llm_model import LLMModel
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
    current_user: User = require_permission("criteria.write"),
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


@router.get("/presets")
async def list_preset_criteria(
    current_user: User = require_permission("criteria.read"),
):
    """Return the catalog of available preset criteria (not stored in DB)."""
    from app.database import PRESET_CRITERIA
    return PRESET_CRITERIA


@router.get("/templates")
async def list_judge_templates(
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("criteria.read"),
):
    """List all judge prompt templates (builtin + user-created)."""
    from app.models.criterion import JudgeTemplate
    stmt = select(JudgeTemplate).order_by(JudgeTemplate.created_at.desc())
    result = await session.exec(stmt)
    return result.all()


@router.post("/templates", status_code=201)
async def create_judge_template(
    body: dict,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("criteria.write"),
):
    """Create or update a judge prompt template."""
    import json as _json

    from app.models.criterion import JudgeTemplate
    t = JudgeTemplate(
        name=body.get("name", ""),
        description=body.get("description", ""),
        system_prompt=body.get("system_prompt", ""),
        dimensions=_json.dumps(body.get("dimensions", []), ensure_ascii=False),
        scale=body.get("scale", 10),
        created_by=current_user.id,
    )
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return t


@router.get("", response_model=list[CriterionResponse])
async def list_criteria(
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("criteria.read"),
):
    stmt = select(Criterion).order_by(Criterion.created_at.desc())
    result = await session.exec(stmt)
    return result.all()


@router.get("/{criterion_id}", response_model=CriterionResponse)
async def get_criterion(
    criterion_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("criteria.read"),
):
    c = await session.get(Criterion, criterion_id)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "评测标准未找到")
    return c


@router.put("/{criterion_id}", response_model=CriterionResponse)
async def update_criterion(
    criterion_id: uuid.UUID,
    body: CriterionUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("criteria.write"),
):
    c = await session.get(Criterion, criterion_id)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "评测标准未找到")
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
    current_user: User = require_permission("criteria.write"),
):
    c = await session.get(Criterion, criterion_id)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "评测标准未找到")

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
    current_user: User = require_permission("criteria.read"),
):
    c = await session.get(Criterion, body.criterion_id)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "评测标准未找到")

    # For llm_judge, resolve judge_model_id to actual credentials
    config_json = c.config_json
    if c.type == "llm_judge":
        try:
            cfg = json.loads(config_json) if config_json else {}
            judge_model_id = cfg.get("judge_model_id")
            if judge_model_id:
                judge_model = await session.get(LLMModel, uuid.UUID(judge_model_id))
                if judge_model:
                    cfg["endpoint_url"] = judge_model.endpoint_url
                    cfg["api_key"] = judge_model.api_key
                    cfg["model_name"] = judge_model.model_name or judge_model.name
                    if getattr(judge_model, "api_format", "openai") == "anthropic":
                        cfg["api_format"] = "anthropic"
                    config_json = json.dumps(cfg)
        except Exception:
            pass

    try:
        score = run_criterion(c.type, config_json, body.expected, body.actual)
    except Exception as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"测试失败: {e}") from e
    return {"score": score, "criterion": c.name, "type": c.type}

import logging
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db, require_permission
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
        source_model_id=body.source_model_id,
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


@router.get("/deployments", response_model=list[LLMModelResponse])
async def list_deployments(
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("models.read"),
):
    """List all models with active vLLM deployments."""
    stmt = (
        select(LLMModel)
        .where(LLMModel.deploy_status.in_(["deploying", "running"]))
        .order_by(col(LLMModel.created_at).desc())
    )
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


@router.post("/{model_id}/deploy")
async def deploy_model(
    model_id: uuid.UUID,
    cluster_id: uuid.UUID | None = None,
    gpu_count: int = 1,
    memory_gb: int = 40,
    timeout_seconds: int = 0,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("models.write"),
):
    """Deploy a model to a K8s cluster via vLLM."""
    from app.models.compute_cluster import ComputeCluster
    from app.services.k8s_vllm import full_vllm_lifecycle

    m = await session.get(LLMModel, model_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")

    if m.deploy_status in ("deploying", "running"):
        raise HTTPException(409, "Model is already deploying or deployed")

    cid = cluster_id or m.cluster_id
    if not cid:
        raise HTTPException(400, "Must specify cluster_id")

    cluster = await session.get(ComputeCluster, cid)
    if not cluster or not cluster.kubeconfig_encrypted:
        raise HTTPException(404, "Cluster not found or missing kubeconfig")

    hf_model_id = m.source_model_id or m.model_name or m.name
    if not hf_model_id:
        raise HTTPException(
            400, "Model needs source_model_id or model_name for deployment",
        )

    m.deploy_status = "deploying"
    m.cluster_id = cluster.id
    session.add(m)
    await session.commit()

    try:
        hf_token = current_user.hf_token or settings.HF_TOKEN or ""
        endpoint, dep_name = await full_vllm_lifecycle(
            kubeconfig_encrypted=cluster.kubeconfig_encrypted,
            namespace=cluster.namespace,
            model_name=m.name,
            hf_model_id=hf_model_id,
            gpu_count=gpu_count,
            gpu_type=cluster.gpu_type or "",
            memory_gb=memory_gb,
            hf_token=hf_token,
            image=getattr(cluster, "vllm_image", "") or "",
            timeout_seconds=timeout_seconds,
        )
        m.endpoint_url = endpoint
        m.deploy_status = "running"
        m.vllm_deployment_name = dep_name
        m.api_key = "not-needed"  # vLLM internal doesn't need auth
        session.add(m)
        await session.commit()
        await session.refresh(m)
        return {
            "status": "deployed",
            "endpoint_url": endpoint,
            "deployment_name": dep_name,
        }
    except Exception as e:
        m.deploy_status = "failed"
        session.add(m)
        await session.commit()
        raise HTTPException(500, f"Deployment failed: {e}") from e


@router.post("/{model_id}/undeploy")
async def undeploy_model(
    model_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("models.write"),
):
    """Stop and remove a vLLM deployment for a model."""
    from app.models.compute_cluster import ComputeCluster
    from app.services.k8s_vllm import cleanup_vllm

    m = await session.get(LLMModel, model_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")

    if not m.cluster_id:
        raise HTTPException(400, "Model is not deployed to any cluster")

    cluster = await session.get(ComputeCluster, m.cluster_id)
    if not cluster or not cluster.kubeconfig_encrypted:
        raise HTTPException(404, "Cluster not found")

    dep_name = m.vllm_deployment_name
    if not dep_name:
        # Fallback: try extracting from endpoint URL
        try:
            from urllib.parse import urlparse
            host = urlparse(m.endpoint_url).hostname or ""
            dep_name = host.split(".")[0]
        except Exception:
            pass

    cleanup_ok = False
    if dep_name:
        try:
            await cleanup_vllm(
                cluster.kubeconfig_encrypted, cluster.namespace, dep_name,
            )
            cleanup_ok = True
        except Exception as e:
            logger.warning("Cleanup failed: %s", e)

    if cleanup_ok or not dep_name:
        m.deploy_status = "stopped"
        m.endpoint_url = ""
        m.vllm_deployment_name = ""
    else:
        m.deploy_status = "cleanup_failed"
        # Keep endpoint_url and deployment_name so retry is possible
    session.add(m)
    await session.commit()
    await session.refresh(m)
    return {"status": "undeployed"}

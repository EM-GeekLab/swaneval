import logging
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
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
        raise HTTPException(status.HTTP_404_NOT_FOUND, "模型未找到")
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
        raise HTTPException(status.HTTP_404_NOT_FOUND, "模型未找到")
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
        raise HTTPException(status.HTTP_404_NOT_FOUND, "模型未找到")

    model_name = m.model_name or m.name or settings.DEFAULT_MODEL_NAME
    endpoint_url = m.endpoint_url or settings.DEFAULT_MODEL_ENDPOINT_URL
    api_key = m.api_key or settings.DEFAULT_MODEL_API_KEY
    # vLLM deployments don't need an API key
    if not api_key and m.vllm_deployment_name:
        api_key = "dummy"
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
        raise HTTPException(status.HTTP_404_NOT_FOUND, "模型未找到")
    try:
        await session.delete(m)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "无法删除：该模型仍被评测任务引用，请先删除相关任务。",
        ) from exc


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
        raise HTTPException(status.HTTP_404_NOT_FOUND, "模型未找到")

    params = {"temperature": body.temperature, "max_tokens": body.max_tokens}

    async with httpx.AsyncClient(timeout=180.0) as client:
        result: ModelCallResult = await _call_model(client, m, body.prompt, params)

    if result.error:
        raise HTTPException(400, f"模型调用失败: {result.error.detail}")

    return PlaygroundResponse(
        output=result.output,
        latency_ms=result.latency_ms,
        tokens_generated=result.tokens_generated,
        model_name=m.model_name or m.name,
    )


async def _do_deploy(
    model_id: uuid.UUID,
    hf_model_id: str,
    model_name: str,
    kubeconfig: str,
    namespace: str,
    gpu_count: int,
    gpu_type: str,
    memory_gb: int,
    hf_token: str,
    vllm_image: str,
) -> None:
    """Background task: deploy vLLM and update model record."""
    import asyncio as _asyncio

    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.database import engine
    from app.services.k8s_vllm import cleanup_vllm, full_vllm_lifecycle

    dep_name: str | None = None
    try:
        # Deploy (no DB session held during K8s operations)
        endpoint, dep_name = await full_vllm_lifecycle(
            kubeconfig_encrypted=kubeconfig,
            namespace=namespace,
            model_name=model_name,
            hf_model_id=hf_model_id,
            gpu_count=gpu_count,
            gpu_type=gpu_type,
            memory_gb=memory_gb,
            hf_token=hf_token,
            image=vllm_image,
        )
        # Success — open session only to save result
        async with AsyncSession(engine) as session:
            m = await session.get(LLMModel, model_id)
            if m:
                # Check if undeploy was called while we were deploying
                if m.deploy_status != "deploying":
                    logger.info(
                        "Deploy for %s completed but status is '%s' (cancelled?), cleaning up",
                        model_id, m.deploy_status,
                    )
                    await cleanup_vllm(kubeconfig, namespace, dep_name)
                    return
                m.endpoint_url = endpoint
                m.deploy_status = "running"
                m.vllm_deployment_name = dep_name
                session.add(m)
                await session.commit()
                logger.info("Deploy succeeded for model %s: %s", model_id, endpoint)
    except (_asyncio.CancelledError, KeyboardInterrupt):
        logger.warning("Deploy cancelled for model %s, cleaning up...", model_id)
        if dep_name:
            try:
                await cleanup_vllm(kubeconfig, namespace, dep_name)
            except Exception:
                logger.warning("Cleanup failed on cancel", exc_info=True)
        try:
            async with AsyncSession(engine) as session:
                m = await session.get(LLMModel, model_id)
                if m and m.deploy_status == "deploying":
                    m.deploy_status = "failed"
                    m.vllm_deployment_name = ""
                    m.endpoint_url = ""
                    session.add(m)
                    await session.commit()
        except Exception:
            logger.error("Failed to mark model as failed after cancel", exc_info=True)
    except Exception as e:
        logger.error("Deploy failed for model %s: %s", model_id, e)
        # Clean up partial K8s deployment
        if dep_name:
            try:
                await cleanup_vllm(kubeconfig, namespace, dep_name)
            except Exception:
                logger.warning("Cleanup failed", exc_info=True)
        try:
            async with AsyncSession(engine) as session:
                m = await session.get(LLMModel, model_id)
                if m and m.deploy_status == "deploying":
                    m.deploy_status = "failed"
                    session.add(m)
                    await session.commit()
        except Exception:
            logger.error("Failed to mark model as failed", exc_info=True)


@router.post("/{model_id}/deploy")
async def deploy_model(
    model_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    cluster_id: uuid.UUID | None = Query(None),
    gpu_count: int = Query(1),
    memory_gb: int = Query(40),
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("models.write"),
):
    """Deploy a model to a K8s cluster via vLLM (non-blocking)."""
    from app.models.compute_cluster import ComputeCluster

    m = await session.get(LLMModel, model_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "模型未找到")

    if m.deploy_status in ("deploying", "running"):
        raise HTTPException(status.HTTP_409_CONFLICT, "模型正在部署或已部署")

    cid = cluster_id or m.cluster_id
    if not cid:
        raise HTTPException(400, "请指定计算集群")

    cluster = await session.get(ComputeCluster, cid)
    if not cluster or not cluster.kubeconfig_encrypted:
        raise HTTPException(404, "集群未找到或缺少 Kubeconfig")

    hf_model_id = m.source_model_id or m.model_name or m.name
    if not hf_model_id:
        raise HTTPException(400, "模型需要 source_model_id 或 model_name")

    # Snapshot ALL values before commit (commit expires ORM objects → MissingGreenlet)
    _model_id = m.id
    _model_name = m.name
    _kubeconfig = cluster.kubeconfig_encrypted
    _namespace = cluster.namespace
    _gpu_type = cluster.gpu_type or ""
    _vllm_image = cluster.vllm_image or ""
    _hf_token = getattr(current_user, "hf_token", "") or settings.HF_TOKEN or ""

    m.deploy_status = "deploying"
    m.cluster_id = cluster.id
    session.add(m)
    await session.commit()

    # Run deployment in background — returns immediately
    background_tasks.add_task(
        _do_deploy, _model_id, hf_model_id, _model_name,
        _kubeconfig, _namespace, gpu_count, _gpu_type,
        memory_gb, _hf_token, _vllm_image,
    )
    return {"status": "deploying", "model_id": str(_model_id)}


@router.post("/{model_id}/undeploy")
async def undeploy_model(
    model_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("models.write"),
):
    """Stop and remove a vLLM deployment for a model."""
    from app.models.compute_cluster import ComputeCluster
    from app.services.k8s_vllm import cleanup_vllm, is_k8s_not_found

    m = await session.get(LLMModel, model_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "模型未找到")

    if not m.cluster_id and not m.vllm_deployment_name:
        # Nothing to undeploy — just reset status
        m.deploy_status = ""
        m.endpoint_url = ""
        m.vllm_deployment_name = ""
        session.add(m)
        await session.commit()
        return {"status": "reset"}

    if not m.cluster_id:
        raise HTTPException(400, "模型未部署到任何集群")

    cluster = await session.get(ComputeCluster, m.cluster_id)
    if not cluster or not cluster.kubeconfig_encrypted:
        raise HTTPException(404, "集群未找到")

    dep_name = m.vllm_deployment_name
    # No URL-parsing fallback — only clean up if we have the actual deployment name

    cleanup_ok = False
    if dep_name:
        try:
            await cleanup_vllm(
                cluster.kubeconfig_encrypted, cluster.namespace, dep_name,
            )
            cleanup_ok = True
        except Exception as e:
            if is_k8s_not_found(e):
                # Already gone — that's fine
                cleanup_ok = True
                logger.info("Deployment %s already removed", dep_name)
            else:
                logger.warning("Cleanup failed: %s", e)
    else:
        # No deployment to clean — just reset the model status
        cleanup_ok = True

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
    return {"status": m.deploy_status}


@router.post("/{model_id}/check-deploy")
async def check_deploy_health(
    model_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("models.read"),
):
    """Check if a deployed model's vLLM pod is still alive.

    Updates deploy_status if the pod has crashed.
    """
    m = await session.get(LLMModel, model_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "模型未找到")

    if m.deploy_status not in ("running", "deploying"):
        return {"status": m.deploy_status, "healthy": False, "reason": "not deployed"}

    if not m.cluster_id or not m.vllm_deployment_name:
        return {"status": m.deploy_status, "healthy": False, "reason": "missing deployment info"}

    from app.models.compute_cluster import ComputeCluster
    from app.services.k8s_vllm import get_deployment_status, is_k8s_not_found

    cluster = await session.get(ComputeCluster, m.cluster_id)
    if not cluster or not cluster.kubeconfig_encrypted:
        return {"status": m.deploy_status, "healthy": False, "reason": "cluster not found"}

    try:
        dep_status = await get_deployment_status(
            cluster.kubeconfig_encrypted, cluster.namespace, m.vllm_deployment_name,
        )
    except Exception as e:
        # Only mark as failed if the deployment is truly gone (404), not on transient errors
        if is_k8s_not_found(e):
            m.deploy_status = "failed"
            m.endpoint_url = ""
            m.vllm_deployment_name = ""
            session.add(m)
            await session.commit()
            return {"status": "failed", "healthy": False, "reason": f"部署已不存在: {e}"}
        # Transient error — don't change model status
        return {"status": m.deploy_status, "healthy": False, "reason": f"无法连接集群: {e}"}

    if dep_status["available"]:
        return {"status": "running", "healthy": True}

    # Pod exists but not ready — might be crashing
    m.deploy_status = "failed"
    session.add(m)
    await session.commit()
    return {
        "status": "failed",
        "healthy": False,
        "reason": "pod not ready",
        "conditions": dep_status.get("conditions", []),
    }

"""Compute cluster management API endpoints."""

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db, require_permission
from app.database import get_session
from app.models.compute_cluster import ClusterStatus, ComputeCluster
from app.models.user import User
from app.schemas.cluster import (
    ClusterCreate,
    ClusterNodeResponse,
    ClusterResponse,
    ClusterUpdate,
)
from app.services.encryption import encrypt
from app.services.k8s_manager import (
    get_cluster_nodes,
    probe_cluster_resources,
    validate_kubeconfig,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Background probe helper
# ---------------------------------------------------------------------------

async def _do_probe(cluster_id: uuid.UUID, kubeconfig_encrypted: str) -> None:
    """Run K8s resource probe in background thread, then persist results."""
    try:
        resources = await asyncio.to_thread(
            probe_cluster_resources, kubeconfig_encrypted,
        )
    except Exception as exc:
        logger.error("Probe failed for cluster %s: %s", cluster_id, exc)
        async for session in get_session():
            cluster = await session.get(ComputeCluster, cluster_id)
            if cluster:
                cluster.status = ClusterStatus.error
                cluster.status_message = f"Probe failed: {exc}"
                cluster.updated_at = datetime.now(timezone.utc)
                session.add(cluster)
                await session.commit()
        return

    async for session in get_session():
        cluster = await session.get(ComputeCluster, cluster_id)
        if not cluster:
            return
        cluster.gpu_count = resources["gpu_count"]
        cluster.gpu_type = resources["gpu_type"]
        cluster.gpu_available = resources.get("gpu_available", resources["gpu_count"])
        cluster.cpu_total_millicores = resources["cpu_total_millicores"]
        cluster.memory_total_bytes = resources["memory_total_bytes"]
        cluster.node_count = resources["node_count"]
        cluster.status = ClusterStatus.ready
        cluster.status_message = ""
        cluster.last_probed_at = datetime.now(timezone.utc)
        cluster.updated_at = datetime.now(timezone.utc)
        session.add(cluster)
        await session.commit()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("", response_model=ClusterResponse, status_code=201)
async def create_cluster(
    body: ClusterCreate,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("clusters.manage"),
):
    """Register a new compute cluster from a kubeconfig."""
    # Validate kubeconfig and test connectivity
    try:
        info = await asyncio.to_thread(validate_kubeconfig, body.kubeconfig)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    kubeconfig_encrypted = encrypt(body.kubeconfig)

    cluster = ComputeCluster(
        name=body.name,
        description=body.description,
        kubeconfig_encrypted=kubeconfig_encrypted,
        api_server_url=info["api_server_url"],
        namespace=body.namespace,
        vllm_image=body.vllm_image,
        status=ClusterStatus.connecting,
        created_by=current_user.id,
    )
    session.add(cluster)
    await session.commit()
    await session.refresh(cluster)

    # Kick off resource probe in background
    background_tasks.add_task(_do_probe, cluster.id, kubeconfig_encrypted)

    return cluster


@router.get("", response_model=list[ClusterResponse])
async def list_clusters(
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("clusters.read"),
):
    """List all registered compute clusters."""
    stmt = select(ComputeCluster).order_by(col(ComputeCluster.created_at).desc())
    result = await session.exec(stmt)
    return result.all()


@router.get("/{cluster_id}", response_model=ClusterResponse)
async def get_cluster(
    cluster_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("clusters.read"),
):
    """Get details for a single compute cluster."""
    cluster = await session.get(ComputeCluster, cluster_id)
    if not cluster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cluster not found")
    return cluster


@router.put("/{cluster_id}", response_model=ClusterResponse)
async def update_cluster(
    cluster_id: uuid.UUID,
    body: ClusterUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("clusters.manage"),
):
    """Update cluster name, description, or namespace."""
    cluster = await session.get(ComputeCluster, cluster_id)
    if not cluster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cluster not found")

    if body.name is not None:
        cluster.name = body.name
    if body.description is not None:
        cluster.description = body.description
    if body.namespace is not None and body.namespace != cluster.namespace:
        from app.models.llm_model import LLMModel
        active_stmt = select(LLMModel).where(
            LLMModel.cluster_id == cluster_id,
            LLMModel.deploy_status.in_(["deploying", "running"]),
        )
        active = (await session.exec(active_stmt)).all()
        if active:
            raise HTTPException(
                409,
                "无法更改命名空间：集群上有活跃的模型部署。请先停止所有部署。",
            )
        cluster.namespace = body.namespace
    if body.vllm_image is not None:
        cluster.vllm_image = body.vllm_image

    cluster.updated_at = datetime.now(timezone.utc)
    session.add(cluster)
    await session.commit()
    await session.refresh(cluster)
    return cluster


@router.delete("/{cluster_id}", status_code=204)
async def delete_cluster(
    cluster_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("clusters.manage"),
):
    """Delete a compute cluster."""
    cluster = await session.get(ComputeCluster, cluster_id)
    if not cluster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cluster not found")

    # Check for active deployments
    from app.models.llm_model import LLMModel
    active_stmt = select(LLMModel).where(
        LLMModel.cluster_id == cluster_id,
        LLMModel.deploy_status.in_(["deploying", "running"]),
    )
    active_models = (await session.exec(active_stmt)).all()
    if active_models:
        names = ", ".join(m.name for m in active_models[:3])
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"集群上仍有运行中的模型部署 ({names})，请先停止部署后再删除集群",
        )

    await session.delete(cluster)
    await session.commit()


@router.post("/{cluster_id}/probe", response_model=ClusterResponse)
async def probe_cluster(
    cluster_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("clusters.manage"),
):
    """Force a resource probe on the cluster."""
    cluster = await session.get(ComputeCluster, cluster_id)
    if not cluster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cluster not found")
    if not cluster.kubeconfig_encrypted:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Cluster has no kubeconfig",
        )

    cluster.status = ClusterStatus.connecting
    cluster.status_message = "Probing..."
    cluster.updated_at = datetime.now(timezone.utc)
    session.add(cluster)
    await session.commit()
    await session.refresh(cluster)

    background_tasks.add_task(
        _do_probe, cluster.id, cluster.kubeconfig_encrypted,
    )
    return cluster


@router.get("/{cluster_id}/nodes", response_model=list[ClusterNodeResponse])
async def list_cluster_nodes(
    cluster_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("clusters.read"),
):
    """List nodes in the cluster with resource details."""
    cluster = await session.get(ComputeCluster, cluster_id)
    if not cluster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cluster not found")
    if not cluster.kubeconfig_encrypted:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Cluster has no kubeconfig",
        )

    try:
        nodes = await asyncio.to_thread(
            get_cluster_nodes, cluster.kubeconfig_encrypted,
        )
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Failed to fetch nodes: {exc}",
        ) from exc

    return nodes


@router.get("/{cluster_id}/deployments")
async def list_cluster_deployments(
    cluster_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("clusters.read"),
):
    """List vLLM deployments in the cluster namespace."""
    cluster = await session.get(ComputeCluster, cluster_id)
    if not cluster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cluster not found")
    if not cluster.kubeconfig_encrypted:
        raise HTTPException(400, "Cluster has no kubeconfig")

    from app.services.k8s_client import create_apps_v1

    try:
        apps_v1 = await asyncio.to_thread(create_apps_v1, cluster.kubeconfig_encrypted)

        def _list():
            deps = apps_v1.list_namespaced_deployment(
                cluster.namespace,
                label_selector="swaneval.io/component=vllm",
            )
            result = []
            for dep in deps.items:
                result.append({
                    "name": dep.metadata.name,
                    "model": dep.metadata.labels.get("swaneval.io/model", ""),
                    "replicas": dep.spec.replicas or 0,
                    "ready_replicas": dep.status.ready_replicas or 0,
                    "available": (dep.status.ready_replicas or 0) >= (dep.spec.replicas or 1),
                    "created_at": (
                        dep.metadata.creation_timestamp.isoformat()
                        if dep.metadata.creation_timestamp else ""
                    ),
                })
            return result

        return await asyncio.to_thread(_list)
    except Exception as e:
        raise HTTPException(502, f"Failed to list deployments: {e}") from e


@router.get("/{cluster_id}/deployments/{deployment_name}/logs")
async def get_deployment_logs(
    cluster_id: uuid.UUID,
    deployment_name: str,
    tail_lines: int = 100,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("clusters.read"),
):
    """Get logs from the first pod of a vLLM deployment."""
    cluster = await session.get(ComputeCluster, cluster_id)
    if not cluster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cluster not found")
    if not cluster.kubeconfig_encrypted:
        raise HTTPException(400, "Cluster has no kubeconfig")

    from app.services.k8s_client import create_core_v1

    try:
        core_v1 = await asyncio.to_thread(create_core_v1, cluster.kubeconfig_encrypted)

        def _get_logs():
            # Find pods belonging to this deployment
            pods = core_v1.list_namespaced_pod(
                cluster.namespace,
                label_selector=f"app={deployment_name}",
            )
            if not pods.items:
                return {"pod": None, "logs": "No pods found for this deployment"}

            pod = pods.items[0]
            pod_name = pod.metadata.name
            pod_status = pod.status.phase

            try:
                log_text = core_v1.read_namespaced_pod_log(
                    pod_name, cluster.namespace,
                    tail_lines=tail_lines,
                    container="vllm",
                )
            except Exception:
                log_text = f"Pod {pod_name} is in {pod_status} state, logs not available yet"

            return {
                "pod": pod_name,
                "status": pod_status,
                "logs": log_text,
            }

        return await asyncio.to_thread(_get_logs)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Failed to get logs: {e}") from e

"""K8s/vLLM execution chain for model deployment and evaluation.

Aligned with official vLLM Helm chart patterns:
  https://docs.vllm.ai/en/stable/deployment/k8s/
  https://docs.vllm.ai/en/stable/deployment/frameworks/helm/

Lifecycle:
1. Prepare namespace (create if needed)
2. Deploy vLLM server as K8s Deployment + Service
3. Wait for readiness (health probe on /health)
4. Return OpenAI-compatible endpoint URL
5. Cleanup after task completes
"""

import asyncio
import logging
import time as _time
import uuid

from app.services.k8s_client import create_both

logger = logging.getLogger(__name__)

# Default vLLM image -- matches official Helm chart
VLLM_IMAGE = "vllm/vllm-openai:latest"


def _get_k8s_clients(kubeconfig_encrypted: str):
    """Create thread-safe K8s API clients (CoreV1 + AppsV1)."""
    return create_both(kubeconfig_encrypted)


async def prepare_namespace(
    kubeconfig_encrypted: str, namespace: str,
) -> None:
    """Ensure the namespace exists, creating it if necessary."""
    from kubernetes import client as k8s_client

    from app.services.k8s_client import create_core_v1
    core_v1 = await asyncio.to_thread(create_core_v1, kubeconfig_encrypted)

    def _ensure():
        try:
            core_v1.read_namespace(namespace)
        except k8s_client.exceptions.ApiException as e:
            if e.status == 404:
                ns = k8s_client.V1Namespace(
                    metadata=k8s_client.V1ObjectMeta(name=namespace),
                )
                core_v1.create_namespace(ns)
                logger.info("Created namespace %s", namespace)
            else:
                raise

    await asyncio.to_thread(_ensure)


async def validate_gpu_support(kubeconfig_encrypted: str, gpu_count: int) -> list[str]:
    """Check cluster GPU support. Returns a list of warnings (empty = all good).

    Does NOT raise — deployment proceeds with warnings logged.
    GPU count of 0 means CPU-only deployment, skips GPU checks entirely.
    """
    if gpu_count <= 0:
        return []

    warnings: list[str] = []

    try:
        from kubernetes import client as k8s_client

        from app.services.k8s_client import create_api_client

        api_client = await asyncio.to_thread(create_api_client, kubeconfig_encrypted)

        def _check():
            w: list[str] = []
            # Check RuntimeClass "nvidia"
            node_v1 = k8s_client.NodeV1Api(api_client=api_client)
            try:
                node_v1.read_runtime_class("nvidia")
            except k8s_client.exceptions.ApiException as e:
                if e.status == 404:
                    w.append(
                        "集群缺少 NVIDIA RuntimeClass，GPU 部署可能失败。"
                        "请安装 NVIDIA GPU Operator。"
                    )
                # Other errors (RBAC etc) — skip, don't block

            # Check GPU availability
            core_v1 = k8s_client.CoreV1Api(api_client=api_client)
            nodes = core_v1.list_node().items
            total_gpu = sum(
                int((n.status.allocatable or {}).get("nvidia.com/gpu", 0))
                for n in nodes
            )
            if total_gpu == 0:
                w.append("集群中未检测到 GPU (nvidia.com/gpu=0)，将尝试 CPU 模式部署。")
            elif total_gpu < gpu_count:
                w.append(f"集群可用 GPU ({total_gpu}) 少于请求数量 ({gpu_count})。")
            return w

        warnings = await asyncio.to_thread(_check)
    except Exception as e:
        logger.warning("GPU validation failed (non-blocking): %s", e)
        warnings.append(f"GPU 检测失败: {e}")

    for w in warnings:
        logger.warning("GPU validation: %s", w)
    return warnings


async def deploy_vllm(
    kubeconfig_encrypted: str,
    namespace: str,
    model_name: str,
    hf_model_id: str,
    gpu_count: int = 1,
    gpu_type: str = "",
    memory_gb: int = 40,
    dtype: str = "auto",
    hf_token: str = "",
    extra_args: list[str] | None = None,
    deployment_name: str | None = None,
    image: str = "",
    service_type: str = "NodePort",
) -> str:
    """Deploy a vLLM server on K8s following official Helm chart patterns.

    Key differences from a naive deployment:
    - runtimeClassName=nvidia when GPUs requested (per official docs)
    - /dev/shm volume for tensor parallelism shared memory
    - Liveness + readiness probes on /health
    - HUGGING_FACE_HUB_TOKEN env var for gated models
    - dtype=auto (bfloat16/float16 auto-detected)

    Returns the deployment name.
    """
    from kubernetes import client as k8s_client

    core_v1, apps_v1 = await asyncio.to_thread(
        _get_k8s_clients, kubeconfig_encrypted,
    )
    dep_name = deployment_name or f"vllm-{uuid.uuid4().hex[:8]}"

    # -- Build container args (matches vLLM Helm chart) --
    args = [
        "--model", hf_model_id,
        "--port", "8000",
        "--dtype", dtype,
        "--trust-remote-code",
    ]
    if gpu_count > 1:
        args += ["--tensor-parallel-size", str(gpu_count)]
    if extra_args:
        args += extra_args

    # -- Environment variables --
    env = [
        k8s_client.V1EnvVar(name="VLLM_LOGGING_LEVEL", value="INFO"),
    ]
    if hf_token:
        env.append(k8s_client.V1EnvVar(
            name="HUGGING_FACE_HUB_TOKEN", value=hf_token,
        ))

    # -- Resource requirements --
    use_gpu = gpu_count > 0
    resources = k8s_client.V1ResourceRequirements(
        limits={
            **({"nvidia.com/gpu": str(gpu_count)} if use_gpu else {}),
            "memory": f"{memory_gb}Gi",
            "cpu": "8",
        },
        requests={
            **({"nvidia.com/gpu": str(gpu_count)} if use_gpu else {}),
            "memory": f"{memory_gb // 2}Gi",
            "cpu": "4",
        },
    )

    # -- Volume mounts -- /dev/shm for tensor parallelism shared memory --
    volume_mounts = [
        k8s_client.V1VolumeMount(
            name="dshm", mount_path="/dev/shm",
        ),
    ]
    volumes = [
        k8s_client.V1Volume(
            name="dshm",
            empty_dir=k8s_client.V1EmptyDirVolumeSource(
                medium="Memory",
                size_limit="8Gi",
            ),
        ),
    ]

    # -- Health probes (matches official Helm chart) --
    readiness_probe = k8s_client.V1Probe(
        http_get=k8s_client.V1HTTPGetAction(path="/health", port=8000),
        initial_delay_seconds=5,
        period_seconds=10,
        failure_threshold=30,
    )
    liveness_probe = k8s_client.V1Probe(
        http_get=k8s_client.V1HTTPGetAction(path="/health", port=8000),
        initial_delay_seconds=15,
        period_seconds=10,
        failure_threshold=3,
    )

    effective_image = image or VLLM_IMAGE
    container = k8s_client.V1Container(
        name="vllm",
        image=effective_image,
        args=args,
        ports=[k8s_client.V1ContainerPort(container_port=8000, name="http")],
        resources=resources,
        env=env,
        volume_mounts=volume_mounts,
        readiness_probe=readiness_probe,
        liveness_probe=liveness_probe,
    )

    # -- Node affinity for GPU type (matches Helm chart gpu_models) --
    affinity = None
    if gpu_type and use_gpu:
        affinity = k8s_client.V1Affinity(
            node_affinity=k8s_client.V1NodeAffinity(
                required_during_scheduling_ignored_during_execution=(
                    k8s_client.V1NodeSelector(
                        node_selector_terms=[
                            k8s_client.V1NodeSelectorTerm(
                                match_expressions=[
                                    k8s_client.V1NodeSelectorRequirement(
                                        key="nvidia.com/gpu.product",
                                        operator="In",
                                        values=[gpu_type],
                                    ),
                                ],
                            ),
                        ],
                    )
                ),
            ),
        )

    label_model = model_name.replace("/", "-")[:63]
    labels = {"app": dep_name, "swaneval.io/component": "vllm", "swaneval.io/model": label_model}

    deployment = k8s_client.V1Deployment(
        metadata=k8s_client.V1ObjectMeta(
            name=dep_name,
            namespace=namespace,
            labels=labels,
        ),
        spec=k8s_client.V1DeploymentSpec(
            replicas=1,
            selector=k8s_client.V1LabelSelector(match_labels={"app": dep_name}),
            template=k8s_client.V1PodTemplateSpec(
                metadata=k8s_client.V1ObjectMeta(labels=labels),
                spec=k8s_client.V1PodSpec(
                    # runtimeClassName=nvidia for GPU scheduling (per official docs)
                    runtime_class_name="nvidia" if use_gpu else None,
                    containers=[container],
                    volumes=volumes,
                    affinity=affinity,
                    restart_policy="Always",
                ),
            ),
        ),
    )

    def _create_deployment():
        apps_v1.create_namespaced_deployment(namespace=namespace, body=deployment)

    await asyncio.to_thread(_create_deployment)
    logger.info(
        "Deployed vLLM %s in %s (image=%s, model=%s, gpu=%d, mem=%dGi, dtype=%s)",
        dep_name, namespace, effective_image, hf_model_id, gpu_count, memory_gb, dtype,
    )

    # ── Service (NodePort for external access, ClusterIP for in-cluster) ──
    allowed_types = ("NodePort", "ClusterIP", "LoadBalancer")
    effective_svc_type = service_type if service_type in allowed_types else "NodePort"
    service = k8s_client.V1Service(
        metadata=k8s_client.V1ObjectMeta(
            name=dep_name, namespace=namespace, labels=labels,
        ),
        spec=k8s_client.V1ServiceSpec(
            selector={"app": dep_name},
            ports=[k8s_client.V1ServicePort(
                port=8000, target_port=8000, name="http",
            )],
            type=effective_svc_type,
        ),
    )

    def _create_service():
        core_v1.create_namespaced_service(namespace=namespace, body=service)

    await asyncio.to_thread(_create_service)
    logger.info("Created %s service %s in %s", effective_svc_type, dep_name, namespace)
    return dep_name


async def _resolve_node_port_endpoint(
    core_v1,
    namespace: str,
    service_name: str,
) -> str:
    """Resolve a NodePort service to an externally reachable URL.

    Returns http://<node_ip>:<node_port>.
    """
    def _resolve():
        svc = core_v1.read_namespaced_service(service_name, namespace)
        node_port = None
        for port in (svc.spec.ports or []):
            if port.node_port:
                node_port = port.node_port
                break
        if not node_port:
            raise RuntimeError(
                f"Service {service_name} has no NodePort assigned"
            )

        # Find a node IP (prefer ExternalIP, fall back to InternalIP)
        nodes = core_v1.list_node().items
        external_ip = None
        internal_ip = None
        for node in nodes:
            for addr in (node.status.addresses or []):
                if addr.type == "ExternalIP" and addr.address:
                    external_ip = addr.address
                elif addr.type == "InternalIP" and addr.address and not internal_ip:
                    internal_ip = addr.address
            if external_ip:
                break  # Found ExternalIP, no need to check more nodes

        node_ip = external_ip or internal_ip
        if not node_ip:
            raise RuntimeError("No node IP found in cluster")

        return f"http://{node_ip}:{node_port}"

    return await asyncio.to_thread(_resolve)


async def wait_vllm_ready(
    kubeconfig_encrypted: str,
    namespace: str,
    deployment_name: str,
    timeout_seconds: int = 600,
    poll_interval: int = 10,
    service_type: str = "NodePort",
) -> str:
    """Wait for vLLM deployment to become ready.

    Returns the OpenAI-compatible chat completions endpoint URL.
    For NodePort services, resolves the external node IP + port.
    For ClusterIP, returns the internal DNS endpoint.
    """
    core_v1, apps_v1 = await asyncio.to_thread(
        _get_k8s_clients, kubeconfig_encrypted,
    )
    t0 = _time.monotonic()

    while True:
        elapsed = _time.monotonic() - t0
        if elapsed >= timeout_seconds:
            break

        def _check():
            dep = apps_v1.read_namespaced_deployment(
                deployment_name, namespace,
            )
            ready = dep.status.ready_replicas or 0
            desired = dep.spec.replicas or 1
            return ready >= desired

        is_ready = await asyncio.to_thread(_check)
        if is_ready:
            if service_type == "NodePort":
                base_url = await _resolve_node_port_endpoint(
                    core_v1, namespace, deployment_name,
                )
            elif service_type == "LoadBalancer":
                # Read service to get load balancer ingress
                def _get_lb():
                    svc = core_v1.read_namespaced_service(deployment_name, namespace)
                    lb = svc.status.load_balancer
                    ingress = (lb.ingress or []) if lb else []
                    if ingress:
                        host = ingress[0].ip or ingress[0].hostname
                        return f"http://{host}:8000"
                    return None
                lb_url = await asyncio.to_thread(_get_lb)
                if lb_url:
                    endpoint = f"{lb_url}/v1/chat/completions"
                    logger.info("vLLM %s is ready at %s", deployment_name, endpoint)
                    return endpoint
                # LB not ready yet, keep polling
                await asyncio.sleep(poll_interval)
                continue
            else:
                base_url = (
                    f"http://{deployment_name}.{namespace}"
                    f".svc.cluster.local:8000"
                )
            endpoint = f"{base_url}/v1/chat/completions"
            logger.info("vLLM %s is ready at %s", deployment_name, endpoint)
            return endpoint

        await asyncio.sleep(poll_interval)
        if int(elapsed) % 30 < poll_interval:
            logger.info(
                "Waiting for vLLM %s... (%ds/%ds)",
                deployment_name, int(elapsed), timeout_seconds,
            )

    raise TimeoutError(
        f"vLLM deployment {deployment_name} not ready "
        f"after {timeout_seconds}s"
    )


async def get_deployment_status(
    kubeconfig_encrypted: str,
    namespace: str,
    deployment_name: str,
) -> dict:
    """Get current status of a vLLM deployment."""
    _, apps_v1 = await asyncio.to_thread(
        _get_k8s_clients, kubeconfig_encrypted,
    )

    def _status():
        dep = apps_v1.read_namespaced_deployment(deployment_name, namespace)
        return {
            "name": deployment_name,
            "ready_replicas": dep.status.ready_replicas or 0,
            "replicas": dep.spec.replicas or 0,
            "available": (dep.status.ready_replicas or 0) >= (dep.spec.replicas or 1),
            "conditions": [
                {"type": c.type, "status": c.status, "message": c.message or ""}
                for c in (dep.status.conditions or [])
            ],
        }

    return await asyncio.to_thread(_status)


async def cleanup_vllm(
    kubeconfig_encrypted: str,
    namespace: str,
    deployment_name: str,
) -> dict:
    """Delete vLLM deployment and service. Returns cleanup status."""
    core_v1, apps_v1 = await asyncio.to_thread(
        _get_k8s_clients, kubeconfig_encrypted,
    )

    def _delete():
        import time

        dep_ok = False
        svc_ok = False
        dep_err = ""
        svc_err = ""

        try:
            apps_v1.delete_namespaced_deployment(deployment_name, namespace)
            dep_ok = True
        except Exception as e:
            dep_err = str(e)
            logger.warning("Failed to delete deployment %s: %s", deployment_name, e)

        try:
            core_v1.delete_namespaced_service(deployment_name, namespace)
            svc_ok = True
        except Exception as e:
            svc_err = str(e)
            logger.warning("Failed to delete service %s: %s", deployment_name, e)

        # Wait briefly for pods to terminate (max 30s)
        if dep_ok:
            for _ in range(6):
                pods = core_v1.list_namespaced_pod(
                    namespace, label_selector=f"app={deployment_name}",
                )
                if not pods.items:
                    break
                time.sleep(5)

        return {"deployment_deleted": dep_ok, "service_deleted": svc_ok,
                "deployment_error": dep_err, "service_error": svc_err}

    result = await asyncio.to_thread(_delete)
    if not result["deployment_deleted"] and not result["service_deleted"]:
        raise RuntimeError(
            f"Cleanup failed completely: deployment={result['deployment_error']}, "
            f"service={result['service_error']}"
        )
    return result


async def full_vllm_lifecycle(
    kubeconfig_encrypted: str,
    namespace: str,
    model_name: str,
    hf_model_id: str,
    gpu_count: int = 1,
    gpu_type: str = "",
    memory_gb: int = 40,
    dtype: str = "auto",
    hf_token: str = "",
    extra_args: list[str] | None = None,
    image: str = "",
    service_type: str = "NodePort",
    timeout_seconds: int = 0,
) -> tuple[str, str]:
    """Complete vLLM lifecycle: prepare -> deploy -> wait -> return endpoint.

    Returns (endpoint_url, deployment_name) so the caller can later invoke
    ``cleanup_vllm`` with the deployment_name once the evaluation finishes.

    Args:
        timeout_seconds: Readiness timeout. 0 means use the default from
            settings.VLLM_READINESS_TIMEOUT (600s).
    """
    from app.config import settings

    effective_timeout = timeout_seconds or settings.VLLM_READINESS_TIMEOUT

    await prepare_namespace(kubeconfig_encrypted, namespace)
    await validate_gpu_support(kubeconfig_encrypted, gpu_count)
    dep_name = await deploy_vllm(
        kubeconfig_encrypted, namespace, model_name, hf_model_id,
        gpu_count=gpu_count, gpu_type=gpu_type, memory_gb=memory_gb,
        dtype=dtype, hf_token=hf_token, extra_args=extra_args,
        image=image, service_type=service_type,
    )
    endpoint = await wait_vllm_ready(
        kubeconfig_encrypted, namespace, dep_name,
        timeout_seconds=effective_timeout,
        service_type=service_type,
    )
    return endpoint, dep_name

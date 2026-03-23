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

    core_v1, _ = await asyncio.to_thread(
        _get_k8s_clients, kubeconfig_encrypted,
    )

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

    # -- ClusterIP Service --
    service = k8s_client.V1Service(
        metadata=k8s_client.V1ObjectMeta(
            name=dep_name, namespace=namespace, labels=labels,
        ),
        spec=k8s_client.V1ServiceSpec(
            selector={"app": dep_name},
            ports=[k8s_client.V1ServicePort(
                port=8000, target_port=8000, name="http",
            )],
            type="ClusterIP",
        ),
    )

    def _create_service():
        core_v1.create_namespaced_service(namespace=namespace, body=service)

    await asyncio.to_thread(_create_service)
    return dep_name


async def wait_vllm_ready(
    kubeconfig_encrypted: str,
    namespace: str,
    deployment_name: str,
    timeout_seconds: int = 600,
    poll_interval: int = 10,
) -> str:
    """Wait for vLLM deployment to become ready.

    Returns the OpenAI-compatible chat completions endpoint URL.
    """
    _, apps_v1 = await asyncio.to_thread(
        _get_k8s_clients, kubeconfig_encrypted,
    )
    elapsed = 0

    while elapsed < timeout_seconds:
        def _check():
            dep = apps_v1.read_namespaced_deployment(deployment_name, namespace)
            ready = dep.status.ready_replicas or 0
            desired = dep.spec.replicas or 1
            return ready >= desired

        is_ready = await asyncio.to_thread(_check)
        if is_ready:
            url = f"http://{deployment_name}.{namespace}.svc.cluster.local:8000"
            logger.info("vLLM %s is ready at %s", deployment_name, url)
            return f"{url}/v1/chat/completions"

        await asyncio.sleep(poll_interval)
        elapsed += poll_interval
        if elapsed % 30 == 0:  # Log every 30s, not every poll
            logger.info(
                "Waiting for vLLM %s... (%ds/%ds)",
                deployment_name, elapsed, timeout_seconds,
            )

    raise TimeoutError(
        f"vLLM deployment {deployment_name} not ready after {timeout_seconds}s"
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
) -> None:
    """Delete vLLM deployment and service after task completion."""
    core_v1, apps_v1 = await asyncio.to_thread(
        _get_k8s_clients, kubeconfig_encrypted,
    )

    def _delete():
        try:
            apps_v1.delete_namespaced_deployment(deployment_name, namespace)
            logger.info("Deleted deployment %s", deployment_name)
        except Exception:
            logger.warning("Failed to delete deployment %s", deployment_name, exc_info=True)

        try:
            core_v1.delete_namespaced_service(deployment_name, namespace)
            logger.info("Deleted service %s", deployment_name)
        except Exception:
            logger.warning("Failed to delete service %s", deployment_name, exc_info=True)

    await asyncio.to_thread(_delete)


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
) -> tuple[str, str]:
    """Complete vLLM lifecycle: prepare -> deploy -> wait -> return endpoint.

    Returns (endpoint_url, deployment_name) so the caller can later invoke
    ``cleanup_vllm`` with the deployment_name once the evaluation finishes.
    """
    await prepare_namespace(kubeconfig_encrypted, namespace)
    dep_name = await deploy_vllm(
        kubeconfig_encrypted, namespace, model_name, hf_model_id,
        gpu_count=gpu_count, gpu_type=gpu_type, memory_gb=memory_gb,
        dtype=dtype, hf_token=hf_token, extra_args=extra_args,
        image=image,
    )
    endpoint = await wait_vllm_ready(kubeconfig_encrypted, namespace, dep_name)
    return endpoint, dep_name

"""K8s/vLLM execution chain for model deployment and evaluation.

Lifecycle:
1. Prepare namespace (create if needed)
2. Deploy vLLM server as K8s Deployment + Service
3. Wait for readiness
4. Return endpoint URL for task runner to call
5. Cleanup after task completes
"""

import asyncio
import logging
import os
import tempfile
import uuid

import yaml

from app.services.encryption import decrypt

logger = logging.getLogger(__name__)


def _get_k8s_clients(kubeconfig_encrypted: str):
    """Create K8s API clients (CoreV1 + AppsV1) from encrypted kubeconfig."""
    from kubernetes import client, config

    kubeconfig_yaml = decrypt(kubeconfig_encrypted)
    kubeconfig_dict = yaml.safe_load(kubeconfig_yaml)

    tmp = tempfile.NamedTemporaryFile(
        mode="w", suffix=".yaml", delete=False,
    )
    try:
        yaml.dump(kubeconfig_dict, tmp)
        tmp.close()
        config.load_kube_config(config_file=tmp.name)
        return client.CoreV1Api(), client.AppsV1Api()
    finally:
        os.unlink(tmp.name)


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
            logger.info("Namespace %s already exists", namespace)
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
    deployment_name: str | None = None,
) -> str:
    """Deploy a vLLM server on K8s as a Deployment + ClusterIP Service.

    Returns the deployment name.
    """
    from kubernetes import client as k8s_client

    core_v1, apps_v1 = await asyncio.to_thread(
        _get_k8s_clients, kubeconfig_encrypted,
    )
    dep_name = deployment_name or f"vllm-{uuid.uuid4().hex[:8]}"

    container = k8s_client.V1Container(
        name="vllm",
        image="vllm/vllm-openai:latest",
        args=[
            "--model", hf_model_id,
            "--tensor-parallel-size", str(gpu_count),
            "--port", "8000",
            "--trust-remote-code",
        ],
        ports=[k8s_client.V1ContainerPort(container_port=8000)],
        resources=k8s_client.V1ResourceRequirements(
            limits={
                "nvidia.com/gpu": str(gpu_count),
                "memory": f"{memory_gb}Gi",
            },
            requests={
                "nvidia.com/gpu": str(gpu_count),
                "memory": f"{memory_gb // 2}Gi",
            },
        ),
        readiness_probe=k8s_client.V1Probe(
            http_get=k8s_client.V1HTTPGetAction(
                path="/health", port=8000,
            ),
            initial_delay_seconds=30,
            period_seconds=10,
            failure_threshold=30,
        ),
    )

    # Add GPU type node selector if specified
    node_selector = {}
    if gpu_type:
        node_selector["nvidia.com/gpu.product"] = gpu_type

    # Truncate model_name to fit K8s label value limit (63 chars)
    label_model = model_name[:63]

    deployment = k8s_client.V1Deployment(
        metadata=k8s_client.V1ObjectMeta(
            name=dep_name,
            namespace=namespace,
            labels={"app": "swaneval-vllm", "model": label_model},
        ),
        spec=k8s_client.V1DeploymentSpec(
            replicas=1,
            selector=k8s_client.V1LabelSelector(
                match_labels={"app": dep_name},
            ),
            template=k8s_client.V1PodTemplateSpec(
                metadata=k8s_client.V1ObjectMeta(
                    labels={"app": dep_name},
                ),
                spec=k8s_client.V1PodSpec(
                    containers=[container],
                    node_selector=node_selector or None,
                    restart_policy="Always",
                ),
            ),
        ),
    )

    def _create_deployment():
        apps_v1.create_namespaced_deployment(
            namespace=namespace, body=deployment,
        )

    await asyncio.to_thread(_create_deployment)
    logger.info("Deployed vLLM %s in namespace %s", dep_name, namespace)

    # Create a ClusterIP Service for internal access
    service = k8s_client.V1Service(
        metadata=k8s_client.V1ObjectMeta(
            name=dep_name, namespace=namespace,
        ),
        spec=k8s_client.V1ServiceSpec(
            selector={"app": dep_name},
            ports=[
                k8s_client.V1ServicePort(port=8000, target_port=8000),
            ],
            type="ClusterIP",
        ),
    )

    def _create_service():
        core_v1.create_namespaced_service(
            namespace=namespace, body=service,
        )

    await asyncio.to_thread(_create_service)
    logger.info("Created service %s in namespace %s", dep_name, namespace)

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
            dep = apps_v1.read_namespaced_deployment(
                deployment_name, namespace,
            )
            ready = dep.status.ready_replicas or 0
            desired = dep.spec.replicas or 1
            return ready >= desired

        is_ready = await asyncio.to_thread(_check)
        if is_ready:
            url = (
                f"http://{deployment_name}.{namespace}"
                f".svc.cluster.local:8000"
            )
            logger.info("vLLM %s is ready at %s", deployment_name, url)
            return f"{url}/v1/chat/completions"

        await asyncio.sleep(poll_interval)
        elapsed += poll_interval
        logger.info(
            "Waiting for vLLM %s... (%ds/%ds)",
            deployment_name, elapsed, timeout_seconds,
        )

    raise TimeoutError(
        f"vLLM deployment {deployment_name} not ready "
        f"after {timeout_seconds}s"
    )


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
            apps_v1.delete_namespaced_deployment(
                deployment_name, namespace,
            )
            logger.info("Deleted deployment %s", deployment_name)
        except Exception:
            logger.warning(
                "Failed to delete deployment %s",
                deployment_name,
                exc_info=True,
            )

        try:
            core_v1.delete_namespaced_service(
                deployment_name, namespace,
            )
            logger.info("Deleted service %s", deployment_name)
        except Exception:
            logger.warning(
                "Failed to delete service %s",
                deployment_name,
                exc_info=True,
            )

    await asyncio.to_thread(_delete)


async def full_vllm_lifecycle(
    kubeconfig_encrypted: str,
    namespace: str,
    model_name: str,
    hf_model_id: str,
    gpu_count: int = 1,
    gpu_type: str = "",
    memory_gb: int = 40,
) -> tuple[str, str]:
    """Complete vLLM lifecycle: prepare -> deploy -> wait -> return endpoint.

    Returns (endpoint_url, deployment_name) so the caller can later invoke
    ``cleanup_vllm`` with the deployment_name once the evaluation finishes.
    """
    await prepare_namespace(kubeconfig_encrypted, namespace)
    dep_name = await deploy_vllm(
        kubeconfig_encrypted,
        namespace,
        model_name,
        hf_model_id,
        gpu_count=gpu_count,
        gpu_type=gpu_type,
        memory_gb=memory_gb,
    )
    endpoint = await wait_vllm_ready(
        kubeconfig_encrypted, namespace, dep_name,
    )
    return endpoint, dep_name

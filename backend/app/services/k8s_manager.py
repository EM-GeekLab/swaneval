"""Kubernetes cluster management service."""

import logging
import os
import tempfile

import yaml

from app.services.k8s_client import create_core_v1

logger = logging.getLogger(__name__)


def _get_k8s_client(kubeconfig_encrypted: str):
    """Create a thread-safe K8s CoreV1Api client."""
    return create_core_v1(kubeconfig_encrypted)


def validate_kubeconfig(kubeconfig_yaml: str) -> dict:
    """Validate kubeconfig, test connectivity, return cluster info."""
    from kubernetes import client, config

    kubeconfig_dict = yaml.safe_load(kubeconfig_yaml)
    if not kubeconfig_dict or "clusters" not in kubeconfig_dict:
        raise ValueError("Invalid kubeconfig: missing clusters")

    clusters = kubeconfig_dict.get("clusters", [])
    api_server = ""
    if clusters:
        api_server = clusters[0].get("cluster", {}).get("server", "")

    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False)
    try:
        yaml.dump(kubeconfig_dict, tmp)
        tmp.close()
        api_client = config.new_client_from_config(config_file=tmp.name)
        v1 = client.CoreV1Api(api_client=api_client)
        v1.list_namespace(limit=1, _request_timeout=10)
    except Exception as e:
        raise ValueError(f"Failed to connect to cluster: {e}") from e
    finally:
        os.unlink(tmp.name)

    return {"api_server_url": api_server}


def probe_cluster_resources(kubeconfig_encrypted: str) -> dict:
    """Probe a cluster for GPU, CPU, memory, and node info."""
    v1 = _get_k8s_client(kubeconfig_encrypted)
    nodes = v1.list_node().items

    total_gpu = 0
    total_cpu = 0
    total_mem = 0
    gpu_type = ""

    for node in nodes:
        alloc = node.status.allocatable or {}
        # GPU
        gpu = int(alloc.get("nvidia.com/gpu", 0))
        total_gpu += gpu
        # CPU (convert from e.g. "8" or "8000m")
        cpu_str = alloc.get("cpu", "0")
        if cpu_str.endswith("m"):
            total_cpu += int(cpu_str[:-1])
        else:
            total_cpu += int(cpu_str) * 1000
        # Memory (convert from e.g. "64Gi")
        mem_str = alloc.get("memory", "0")
        total_mem += _parse_memory(mem_str)
        # GPU type from labels
        if gpu > 0 and not gpu_type:
            labels = node.metadata.labels or {}
            gpu_type = labels.get(
                "nvidia.com/gpu.product",
                labels.get("gpu-type", "Unknown GPU"),
            )

    return {
        "gpu_count": total_gpu,
        "gpu_type": gpu_type,
        "cpu_total_millicores": total_cpu,
        "memory_total_bytes": total_mem,
        "node_count": len(nodes),
    }


def get_cluster_nodes(kubeconfig_encrypted: str) -> list[dict]:
    """Get per-node resource details."""
    v1 = _get_k8s_client(kubeconfig_encrypted)
    nodes = v1.list_node().items
    result = []
    for node in nodes:
        alloc = node.status.allocatable or {}
        labels = node.metadata.labels or {}
        gpu = int(alloc.get("nvidia.com/gpu", 0))
        cpu_str = alloc.get("cpu", "0")
        cpu_m = int(cpu_str[:-1]) if cpu_str.endswith("m") else int(cpu_str) * 1000
        result.append({
            "name": node.metadata.name,
            "gpu_count": gpu,
            "gpu_type": labels.get("nvidia.com/gpu.product", ""),
            "cpu_millicores": cpu_m,
            "memory_bytes": _parse_memory(alloc.get("memory", "0")),
            "status": (
                "Ready" if any(
                    c.type == "Ready" and c.status == "True"
                    for c in (node.status.conditions or [])
                ) else "NotReady"
            ),
        })
    return result


def _parse_memory(mem_str: str) -> int:
    """Parse K8s memory string to bytes."""
    mem_str = str(mem_str)
    units = {
        "Ki": 1024, "Mi": 1024**2, "Gi": 1024**3, "Ti": 1024**4,
        "K": 1000, "M": 1000**2, "G": 1000**3, "T": 1000**4,
    }
    for suffix, multiplier in units.items():
        if mem_str.endswith(suffix):
            return int(float(mem_str[:-len(suffix)]) * multiplier)
    try:
        return int(mem_str)
    except ValueError:
        return 0

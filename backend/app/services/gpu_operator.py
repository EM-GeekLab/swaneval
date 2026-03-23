"""Install NVIDIA GPU Operator on a Kubernetes cluster.

Uses kubectl apply with the official NVIDIA manifests.
For Helm-based installation, the subprocess calls `helm` CLI.
"""

import asyncio
import logging
import os
import subprocess
import tempfile

import yaml

from app.services.encryption import decrypt

logger = logging.getLogger(__name__)

# Installation methods in order of preference
DEVICE_PLUGIN_URL = (
    "https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/"
    "v0.17.0/deployments/static/nvidia-device-plugin.yml"
)


async def install_gpu_operator(
    kubeconfig_encrypted: str,
    method: str = "device-plugin",
) -> dict:
    """Install NVIDIA GPU support on a K8s cluster.

    Methods:
    - "device-plugin": Lightweight, just the device plugin DaemonSet.
      Requires NVIDIA drivers already installed on nodes.
    - "gpu-operator": Full NVIDIA GPU Operator via Helm.
      Manages drivers, toolkit, device plugin, and monitoring.

    Returns: {"ok": bool, "method": str, "message": str}
    """
    logger.info("Installing GPU support: method=%s", method)
    kubeconfig_yaml = decrypt(kubeconfig_encrypted)

    if method == "gpu-operator":
        result = await _install_via_helm(kubeconfig_yaml)
    else:
        result = await _install_device_plugin(kubeconfig_yaml)

    logger.info("GPU install result: ok=%s, message=%s", result["ok"], result["message"])
    return result


async def _install_device_plugin(kubeconfig_yaml: str) -> dict:
    """Install just the NVIDIA device plugin DaemonSet."""
    def _run():
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False,
        ) as tmp:
            tmp.write(kubeconfig_yaml)
            tmp.flush()
            kubeconfig_path = tmp.name

        try:
            logger.info("Installing NVIDIA Device Plugin via kubectl apply...")
            result = subprocess.run(
                [
                    "kubectl", "apply",
                    "-f", DEVICE_PLUGIN_URL,
                    "--kubeconfig", kubeconfig_path,
                ],
                capture_output=True, text=True, timeout=60,
            )
            stdout = result.stdout.strip()
            stderr = result.stderr.strip()
            logger.info("kubectl apply stdout: %s", stdout)
            if stderr:
                logger.info("kubectl apply stderr: %s", stderr)
            if result.returncode != 0:
                logger.error("kubectl apply failed (rc=%d): %s", result.returncode, stderr)
                return {
                    "ok": False,
                    "method": "device-plugin",
                    "message": f"kubectl apply 失败: {stderr}",
                }
            return {
                "ok": True,
                "method": "device-plugin",
                "message": stdout or "NVIDIA Device Plugin 已安装",
            }
        except FileNotFoundError:
            return {
                "ok": False,
                "method": "device-plugin",
                "message": "后端服务器未安装 kubectl。"
                "安装方法：macOS 运行 brew install kubectl，"
                "Linux 运行 curl -LO https://dl.k8s.io/release/$(curl -sL "
                "https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl "
                "&& chmod +x kubectl && sudo mv kubectl /usr/local/bin/",
            }
        except subprocess.TimeoutExpired:
            return {
                "ok": False,
                "method": "device-plugin",
                "message": "Installation timed out (60s)",
            }
        finally:
            os.unlink(kubeconfig_path)

    return await asyncio.to_thread(_run)


async def _install_via_helm(kubeconfig_yaml: str) -> dict:
    """Install NVIDIA GPU Operator via Helm chart."""
    def _run():
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False,
        ) as tmp:
            tmp.write(kubeconfig_yaml)
            tmp.flush()
            kubeconfig_path = tmp.name

        env = {**os.environ, "KUBECONFIG": kubeconfig_path}

        try:
            # Add NVIDIA Helm repo
            repo_add = subprocess.run(
                ["helm", "repo", "add", "nvidia",
                 "https://helm.ngc.nvidia.com/nvidia", "--force-update"],
                capture_output=True, text=True, timeout=30, env=env,
            )
            logger.info("helm repo add: %s", repo_add.stdout.strip() or repo_add.stderr.strip())

            repo_update = subprocess.run(
                ["helm", "repo", "update"],
                capture_output=True, text=True, timeout=60, env=env,
            )
            logger.info(
                "helm repo update: %s",
                repo_update.stdout.strip() or repo_update.stderr.strip(),
            )

            # Install GPU Operator (no --wait, return immediately)
            result = subprocess.run(
                [
                    "helm", "install", "gpu-operator",
                    "nvidia/gpu-operator",
                    "--namespace", "gpu-operator",
                    "--create-namespace",
                ],
                capture_output=True, text=True, timeout=120, env=env,
            )
            stdout = result.stdout.strip()
            stderr = result.stderr.strip()
            logger.info("helm install stdout: %s", stdout)
            if stderr:
                logger.info("helm install stderr: %s", stderr)

            if result.returncode != 0:
                # Already installed is not an error
                if "already exists" in stderr or "cannot re-use" in stderr:
                    return {
                        "ok": True,
                        "method": "gpu-operator",
                        "message": "NVIDIA GPU Operator 已安装",
                    }
                return {
                    "ok": False,
                    "method": "gpu-operator",
                    "message": f"Helm 安装失败: {stderr[:500]}",
                }
            return {
                "ok": True,
                "method": "gpu-operator",
                "message": "GPU Operator 已提交安装，Pod 启动中（可能需要几分钟）。"
                "请稍后刷新查看 GPU 状态。",
            }
        except FileNotFoundError:
            return {
                "ok": False,
                "method": "gpu-operator",
                "message": "后端服务器未安装 Helm CLI。"
                "安装方法：macOS 运行 brew install helm，"
                "Linux 运行 curl https://raw.githubusercontent.com/helm/helm/"
                "main/scripts/get-helm-3 | bash",
            }
        except subprocess.TimeoutExpired:
            return {
                "ok": False,
                "method": "gpu-operator",
                "message": "Installation timed out (6 min). "
                "GPU Operator may still be installing in the background.",
            }
        finally:
            os.unlink(kubeconfig_path)

    return await asyncio.to_thread(_run)


async def check_gpu_operator_status(kubeconfig_encrypted: str) -> dict:
    """Check if GPU support is available on the cluster."""
    kubeconfig_yaml = decrypt(kubeconfig_encrypted)

    def _check():
        kubeconfig_dict = yaml.safe_load(kubeconfig_yaml)

        from kubernetes import client
        from kubernetes.config import new_client_from_config_dict

        api_client = new_client_from_config_dict(kubeconfig_dict)
        v1 = client.CoreV1Api(api_client=api_client)

        # Check if any node has nvidia.com/gpu
        nodes = v1.list_node().items
        gpu_nodes = [
            n.metadata.name
            for n in nodes
            if int((n.status.allocatable or {}).get("nvidia.com/gpu", 0)) > 0
        ]

        # Check for device plugin or gpu-operator pods
        has_device_plugin = False
        has_gpu_operator = False
        try:
            pods = v1.list_pod_for_all_namespaces(
                label_selector="app=nvidia-device-plugin-daemonset",
            ).items
            has_device_plugin = len(pods) > 0
        except Exception:
            pass
        try:
            pods = v1.list_namespaced_pod(
                "gpu-operator",
                label_selector="app=gpu-operator",
            ).items
            has_gpu_operator = len(pods) > 0
        except Exception:
            pass

        return {
            "gpu_nodes": gpu_nodes,
            "gpu_node_count": len(gpu_nodes),
            "has_device_plugin": has_device_plugin,
            "has_gpu_operator": has_gpu_operator,
            "ready": len(gpu_nodes) > 0,
        }

    return await asyncio.to_thread(_check)

"""Tests for vLLM K8s deployment lifecycle."""

import unittest
from unittest.mock import MagicMock, patch
from types import SimpleNamespace

from app.services.k8s_vllm import is_k8s_not_found


def _make_to_thread_mock():
    """Create an async side_effect that runs callables synchronously."""

    async def run_sync(fn, *args):
        return fn(*args) if args else fn()

    mock = MagicMock()
    mock.side_effect = run_sync
    return mock


class TestIsK8sNotFound(unittest.TestCase):
    def test_not_found_message(self):
        self.assertTrue(is_k8s_not_found(Exception("Resource not found")))

    def test_404_code(self):
        self.assertTrue(is_k8s_not_found(Exception("HTTP 404: page missing")))

    def test_not_found_case_insensitive(self):
        self.assertTrue(is_k8s_not_found(Exception("NOT FOUND")))

    def test_other_error(self):
        self.assertFalse(is_k8s_not_found(Exception("Connection refused")))

    def test_empty_message(self):
        self.assertFalse(is_k8s_not_found(Exception("")))


class TestValidateGpuSupport(unittest.IsolatedAsyncioTestCase):
    async def test_zero_gpu_skips(self):
        from app.services.k8s_vllm import validate_gpu_support

        warnings = await validate_gpu_support("encrypted", 0)
        self.assertEqual(warnings, [])

    async def test_negative_gpu_skips(self):
        from app.services.k8s_vllm import validate_gpu_support

        warnings = await validate_gpu_support("encrypted", -1)
        self.assertEqual(warnings, [])

    async def test_no_gpus_warns(self):
        from app.services.k8s_vllm import validate_gpu_support

        fake_api_client = MagicMock()
        fake_node_v1 = MagicMock()
        fake_core_v1 = MagicMock()

        node = SimpleNamespace(
            status=SimpleNamespace(allocatable={"cpu": "8", "memory": "32Gi"}),
            metadata=SimpleNamespace(labels={}),
        )
        fake_core_v1.list_node.return_value = SimpleNamespace(items=[node])

        with patch("app.services.k8s_vllm.asyncio.to_thread", new=_make_to_thread_mock()), \
             patch("app.services.k8s_vllm.create_api_client", return_value=fake_api_client), \
             patch("kubernetes.client.NodeV1Api", return_value=fake_node_v1), \
             patch("kubernetes.client.CoreV1Api", return_value=fake_core_v1):
            warnings = await validate_gpu_support("encrypted", 1)

        self.assertTrue(any("GPU" in w or "gpu" in w for w in warnings))

    async def test_insufficient_gpus_warns(self):
        from app.services.k8s_vllm import validate_gpu_support

        fake_api_client = MagicMock()
        fake_node_v1 = MagicMock()
        fake_core_v1 = MagicMock()

        node = SimpleNamespace(
            status=SimpleNamespace(
                allocatable={"cpu": "8", "memory": "32Gi", "nvidia.com/gpu": "2"},
            ),
            metadata=SimpleNamespace(labels={}),
        )
        fake_core_v1.list_node.return_value = SimpleNamespace(items=[node])

        with patch("app.services.k8s_vllm.asyncio.to_thread", new=_make_to_thread_mock()), \
             patch("app.services.k8s_vllm.create_api_client", return_value=fake_api_client), \
             patch("kubernetes.client.NodeV1Api", return_value=fake_node_v1), \
             patch("kubernetes.client.CoreV1Api", return_value=fake_core_v1):
            warnings = await validate_gpu_support("encrypted", 4)

        self.assertTrue(len(warnings) > 0)
        self.assertTrue(any("2" in w and "4" in w for w in warnings))

    async def test_connection_failure_non_blocking(self):
        from app.services.k8s_vllm import validate_gpu_support

        with patch("app.services.k8s_vllm.asyncio.to_thread", new=_make_to_thread_mock()), \
             patch("app.services.k8s_vllm.create_api_client", side_effect=Exception("Connection refused")):
            warnings = await validate_gpu_support("encrypted", 1)

        self.assertTrue(len(warnings) > 0)


class TestCleanupVllm(unittest.IsolatedAsyncioTestCase):
    async def test_successful_cleanup(self):
        from app.services.k8s_vllm import cleanup_vllm

        core_v1 = MagicMock()
        apps_v1 = MagicMock()
        core_v1.list_namespaced_pod.return_value = SimpleNamespace(items=[])

        with patch("app.services.k8s_vllm.asyncio.to_thread", new=_make_to_thread_mock()), \
             patch("app.services.k8s_vllm._get_k8s_clients", return_value=(core_v1, apps_v1)):
            result = await cleanup_vllm("encrypted", "default", "vllm-test")

        self.assertTrue(result["deployment_deleted"])
        self.assertTrue(result["service_deleted"])
        self.assertEqual(result["deployment_error"], "")
        self.assertEqual(result["service_error"], "")

    async def test_already_gone_is_ok(self):
        from app.services.k8s_vllm import cleanup_vllm

        core_v1 = MagicMock()
        apps_v1 = MagicMock()

        apps_v1.delete_namespaced_deployment.side_effect = Exception(
            "Not Found: deployment not found"
        )
        core_v1.delete_namespaced_service.side_effect = Exception(
            "HTTP 404: service not found"
        )
        core_v1.list_namespaced_pod.return_value = SimpleNamespace(items=[])

        with patch("app.services.k8s_vllm.asyncio.to_thread", new=_make_to_thread_mock()), \
             patch("app.services.k8s_vllm._get_k8s_clients", return_value=(core_v1, apps_v1)):
            result = await cleanup_vllm("encrypted", "default", "vllm-test")

        self.assertTrue(result["deployment_deleted"])
        self.assertTrue(result["service_deleted"])

    async def test_both_fail_raises(self):
        from app.services.k8s_vllm import cleanup_vllm

        core_v1 = MagicMock()
        apps_v1 = MagicMock()

        apps_v1.delete_namespaced_deployment.side_effect = Exception(
            "Connection refused"
        )
        core_v1.delete_namespaced_service.side_effect = Exception(
            "Connection refused"
        )

        with patch("app.services.k8s_vllm.asyncio.to_thread", new=_make_to_thread_mock()), \
             patch("app.services.k8s_vllm._get_k8s_clients", return_value=(core_v1, apps_v1)):
            with self.assertRaises(RuntimeError) as ctx:
                await cleanup_vllm("encrypted", "default", "vllm-test")
            self.assertIn("Cleanup failed completely", str(ctx.exception))


class TestPrepareNamespace(unittest.IsolatedAsyncioTestCase):
    async def test_namespace_already_exists(self):
        from app.services.k8s_vllm import prepare_namespace

        core_v1 = MagicMock()
        core_v1.read_namespace.return_value = SimpleNamespace(
            metadata=SimpleNamespace(name="eval"),
        )

        call_index = 0

        async def run_sync(fn, *args):
            nonlocal call_index
            call_index += 1
            if call_index == 1:
                # First call is create_core_v1(kubeconfig_encrypted)
                return core_v1
            return fn(*args) if args else fn()

        mock_to_thread = MagicMock()
        mock_to_thread.side_effect = run_sync

        with patch("app.services.k8s_vllm.asyncio.to_thread", new=mock_to_thread):
            await prepare_namespace("encrypted", "eval")

        core_v1.read_namespace.assert_called_with("eval")
        core_v1.create_namespace.assert_not_called()

    async def test_namespace_created_on_404(self):
        from kubernetes.client.exceptions import ApiException

        from app.services.k8s_vllm import prepare_namespace

        core_v1 = MagicMock()
        core_v1.read_namespace.side_effect = ApiException(
            status=404, reason="Not Found",
        )

        call_index = 0

        async def run_sync(fn, *args):
            nonlocal call_index
            call_index += 1
            if call_index == 1:
                return core_v1
            return fn(*args) if args else fn()

        mock_to_thread = MagicMock()
        mock_to_thread.side_effect = run_sync

        with patch("app.services.k8s_vllm.asyncio.to_thread", new=mock_to_thread):
            await prepare_namespace("encrypted", "new-ns")

        core_v1.create_namespace.assert_called_once()


class TestGetDeploymentStatus(unittest.IsolatedAsyncioTestCase):
    async def test_returns_status_dict(self):
        from app.services.k8s_vllm import get_deployment_status

        core_v1 = MagicMock()
        apps_v1 = MagicMock()

        dep = SimpleNamespace(
            status=SimpleNamespace(
                ready_replicas=1,
                conditions=[
                    SimpleNamespace(type="Available", status="True", message="ok"),
                ],
            ),
            spec=SimpleNamespace(replicas=1),
        )
        apps_v1.read_namespaced_deployment.return_value = dep

        with patch("app.services.k8s_vllm.asyncio.to_thread", new=_make_to_thread_mock()), \
             patch("app.services.k8s_vllm._get_k8s_clients", return_value=(core_v1, apps_v1)):
            result = await get_deployment_status("encrypted", "default", "vllm-abc")

        self.assertEqual(result["name"], "vllm-abc")
        self.assertEqual(result["ready_replicas"], 1)
        self.assertTrue(result["available"])
        self.assertEqual(len(result["conditions"]), 1)
        self.assertEqual(result["conditions"][0]["type"], "Available")


if __name__ == "__main__":
    unittest.main()

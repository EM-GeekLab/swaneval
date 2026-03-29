"""Tests for K8s cluster management utilities."""

import unittest
from unittest.mock import MagicMock, patch
from types import SimpleNamespace

from app.services.k8s_manager import _parse_memory, _parse_cpu


class TestParseMemory(unittest.TestCase):
    def test_gi(self):
        self.assertEqual(_parse_memory("64Gi"), 64 * 1024**3)

    def test_mi(self):
        self.assertEqual(_parse_memory("512Mi"), 512 * 1024**2)

    def test_ki(self):
        self.assertEqual(_parse_memory("1024Ki"), 1024 * 1024)

    def test_ti(self):
        self.assertEqual(_parse_memory("1Ti"), 1024**4)

    def test_g_decimal(self):
        self.assertEqual(_parse_memory("1G"), 1_000_000_000)

    def test_bare_bytes(self):
        self.assertEqual(_parse_memory("1073741824"), 1073741824)

    def test_float_gi(self):
        self.assertEqual(_parse_memory("1.5Gi"), int(1.5 * 1024**3))

    def test_empty(self):
        self.assertEqual(_parse_memory(""), 0)

    def test_invalid(self):
        self.assertEqual(_parse_memory("abc"), 0)

    def test_zero(self):
        self.assertEqual(_parse_memory("0"), 0)

    def test_exponent_notation(self):
        self.assertEqual(_parse_memory("128e6"), 128_000_000)


class TestParseCpu(unittest.TestCase):
    def test_millicores(self):
        self.assertEqual(_parse_cpu("500m"), 500)

    def test_whole_cores(self):
        self.assertEqual(_parse_cpu("4"), 4000)

    def test_decimal_cores(self):
        self.assertEqual(_parse_cpu("3.5"), 3500)

    def test_one_core(self):
        self.assertEqual(_parse_cpu("1"), 1000)

    def test_zero(self):
        self.assertEqual(_parse_cpu("0"), 0)

    def test_empty(self):
        self.assertEqual(_parse_cpu(""), 0)

    def test_invalid(self):
        self.assertEqual(_parse_cpu("abc"), 0)


class TestProbeClusterResources(unittest.TestCase):
    """Test probe_cluster_resources with mocked K8s client."""

    @patch("app.services.k8s_manager._get_k8s_client")
    def test_single_gpu_node(self, mock_get_client):
        from app.services.k8s_manager import probe_cluster_resources

        node = SimpleNamespace(
            status=SimpleNamespace(
                allocatable={
                    "nvidia.com/gpu": "2",
                    "cpu": "16",
                    "memory": "64Gi",
                },
            ),
            metadata=SimpleNamespace(
                labels={"nvidia.com/gpu.product": "A100"},
            ),
        )
        v1 = MagicMock()
        v1.list_node.return_value = SimpleNamespace(items=[node])
        # No running pods requesting GPUs
        v1.list_pod_for_all_namespaces.return_value = SimpleNamespace(items=[])
        mock_get_client.return_value = v1

        result = probe_cluster_resources("encrypted")
        self.assertEqual(result["gpu_count"], 2)
        self.assertEqual(result["gpu_available"], 2)
        self.assertEqual(result["gpu_type"], "A100")
        self.assertEqual(result["cpu_total_millicores"], 16000)
        self.assertEqual(result["memory_total_bytes"], 64 * 1024**3)
        self.assertEqual(result["node_count"], 1)

    @patch("app.services.k8s_manager._get_k8s_client")
    def test_no_gpu_node(self, mock_get_client):
        from app.services.k8s_manager import probe_cluster_resources

        node = SimpleNamespace(
            status=SimpleNamespace(
                allocatable={"cpu": "4", "memory": "8Gi"},
            ),
            metadata=SimpleNamespace(labels={}),
        )
        v1 = MagicMock()
        v1.list_node.return_value = SimpleNamespace(items=[node])
        v1.list_pod_for_all_namespaces.return_value = SimpleNamespace(items=[])
        mock_get_client.return_value = v1

        result = probe_cluster_resources("encrypted")
        self.assertEqual(result["gpu_count"], 0)
        self.assertEqual(result["gpu_available"], 0)
        self.assertEqual(result["gpu_type"], "")

    @patch("app.services.k8s_manager._get_k8s_client")
    def test_gpu_in_use_subtracted(self, mock_get_client):
        from app.services.k8s_manager import probe_cluster_resources

        node = SimpleNamespace(
            status=SimpleNamespace(
                allocatable={"nvidia.com/gpu": "4", "cpu": "8", "memory": "32Gi"},
            ),
            metadata=SimpleNamespace(labels={"nvidia.com/gpu.product": "V100"}),
        )
        pod = SimpleNamespace(
            spec=SimpleNamespace(
                containers=[
                    SimpleNamespace(
                        resources=SimpleNamespace(
                            requests={"nvidia.com/gpu": "1"},
                        ),
                    ),
                ],
            ),
        )
        v1 = MagicMock()
        v1.list_node.return_value = SimpleNamespace(items=[node])
        v1.list_pod_for_all_namespaces.return_value = SimpleNamespace(items=[pod])
        mock_get_client.return_value = v1

        result = probe_cluster_resources("encrypted")
        self.assertEqual(result["gpu_count"], 4)
        self.assertEqual(result["gpu_available"], 3)


class TestGetClusterNodes(unittest.TestCase):
    @patch("app.services.k8s_manager._get_k8s_client")
    def test_node_ready(self, mock_get_client):
        from app.services.k8s_manager import get_cluster_nodes

        node = SimpleNamespace(
            metadata=SimpleNamespace(
                name="node-1",
                labels={"nvidia.com/gpu.product": "A100"},
            ),
            status=SimpleNamespace(
                allocatable={
                    "nvidia.com/gpu": "1",
                    "cpu": "8",
                    "memory": "32Gi",
                },
                conditions=[
                    SimpleNamespace(type="Ready", status="True"),
                ],
            ),
        )
        v1 = MagicMock()
        v1.list_node.return_value = SimpleNamespace(items=[node])
        mock_get_client.return_value = v1

        nodes = get_cluster_nodes("encrypted")
        self.assertEqual(len(nodes), 1)
        self.assertEqual(nodes[0]["name"], "node-1")
        self.assertEqual(nodes[0]["gpu_count"], 1)
        self.assertEqual(nodes[0]["status"], "Ready")

    @patch("app.services.k8s_manager._get_k8s_client")
    def test_node_not_ready(self, mock_get_client):
        from app.services.k8s_manager import get_cluster_nodes

        node = SimpleNamespace(
            metadata=SimpleNamespace(name="node-2", labels={}),
            status=SimpleNamespace(
                allocatable={"cpu": "4", "memory": "16Gi"},
                conditions=[
                    SimpleNamespace(type="Ready", status="False"),
                ],
            ),
        )
        v1 = MagicMock()
        v1.list_node.return_value = SimpleNamespace(items=[node])
        mock_get_client.return_value = v1

        nodes = get_cluster_nodes("encrypted")
        self.assertEqual(nodes[0]["status"], "NotReady")
        self.assertEqual(nodes[0]["gpu_count"], 0)


if __name__ == "__main__":
    unittest.main()

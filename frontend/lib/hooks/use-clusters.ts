import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { ComputeCluster, ClusterNode } from "@/lib/types";

export function useClusters() {
  return useQuery({
    queryKey: ["clusters"],
    queryFn: async () => {
      const res = await api.get<ComputeCluster[]>("/clusters");
      return res.data;
    },
    staleTime: 10_000,
  });
}

export function useCluster(id: string) {
  return useQuery({
    queryKey: ["clusters", id],
    queryFn: async () => {
      const res = await api.get<ComputeCluster>(`/clusters/${id}`);
      return res.data;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateCluster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; kubeconfig: string; namespace?: string; description?: string; vllm_image?: string }) => {
      const res = await api.post<ComputeCluster>("/clusters", data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clusters"] }),
  });
}

export function useUpdateCluster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { id: string; name?: string; description?: string; namespace?: string; vllm_image?: string }) => {
      const { id, ...body } = data;
      const res = await api.put<ComputeCluster>(`/clusters/${id}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clusters"] }),
  });
}

export function useDeleteCluster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await api.delete(`/clusters/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clusters"] }),
  });
}

export function useProbeCluster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<ComputeCluster>(`/clusters/${id}/probe`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clusters"] }),
  });
}

export function useClusterNodes(id: string) {
  return useQuery({
    queryKey: ["clusters", id, "nodes"],
    queryFn: async () => {
      const res = await api.get<ClusterNode[]>(`/clusters/${id}/nodes`);
      return res.data;
    },
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useInstallGpuSupport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { cluster_id: string; method: string }) => {
      const res = await api.post<{ ok: boolean; method: string; message: string }>(
        `/clusters/${data.cluster_id}/install-gpu-support`,
        null,
        { params: { method: data.method } },
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clusters"] }),
  });
}

export function useGpuStatus(id: string) {
  return useQuery({
    queryKey: ["clusters", id, "gpu-status"],
    queryFn: async () => {
      const res = await api.get<{
        gpu_nodes: string[];
        gpu_node_count: number;
        has_device_plugin: boolean;
        has_gpu_operator: boolean;
        ready: boolean;
      }>(`/clusters/${id}/gpu-status`);
      return res.data;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

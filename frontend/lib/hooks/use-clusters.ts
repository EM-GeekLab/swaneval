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
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Dataset } from "@/lib/types";

export function useDatasets(tag?: string) {
  return useQuery({
    queryKey: ["datasets", tag],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (tag) params.tag = tag;
      const res = await api.get<Dataset[]>("/datasets", { params });
      return res.data;
    },
  });
}

export function useDataset(id: string) {
  return useQuery({
    queryKey: ["datasets", id],
    queryFn: async () => {
      const res = await api.get<Dataset>(`/datasets/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useDatasetPreview(id: string, enabled = false) {
  return useQuery({
    queryKey: ["datasets", id, "preview"],
    queryFn: async () => {
      const res = await api.get<{ rows: Record<string, unknown>[]; total: number }>(
        `/datasets/${id}/preview`
      );
      return res.data;
    },
    enabled,
  });
}

export function useUploadDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { file: File; name: string; description?: string; tags?: string }) => {
      const form = new FormData();
      form.append("file", data.file);
      form.append("name", data.name);
      if (data.description) form.append("description", data.description);
      if (data.tags) form.append("tags", data.tags);
      const res = await api.post<Dataset>("/datasets/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datasets"] }),
  });
}

export function useMountDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      server_path: string;
      format?: string;
      tags?: string;
    }) => {
      const res = await api.post<Dataset>("/datasets/mount", data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datasets"] }),
  });
}

export function useDeleteDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/datasets/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datasets"] }),
  });
}

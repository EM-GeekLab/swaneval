import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  Dataset,
  DatasetVersion,
  DatasetStats,
  SyncLog,
  PreflightResult,
  PresetDataset,
  PaginatedResponse,
} from "@/lib/types";

export function useDatasets(tag?: string, page = 1, pageSize = 200) {
  return useQuery({
    queryKey: ["datasets", tag, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (tag) params.tag = tag;
      const res = await api.get<PaginatedResponse<Dataset>>("/datasets", { params });
      return res.data;
    },
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
      const res = await api.post<Dataset>("/datasets/upload", form);
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

export function useImportDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      source: string;
      dataset_id: string;
      name?: string;
      subset?: string;
      split?: string;
      description?: string;
      tags?: string;
      job_id?: string;
    }) => {
      const { job_id, ...body } = data;
      const params = job_id ? { job_id } : {};
      const res = await api.post<Dataset>("/datasets/import", body, { params });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datasets"] }),
  });
}

export function useSubscribeDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      id: string;
      hf_dataset_id: string;
      hf_subset?: string;
      hf_split?: string;
      update_interval_hours?: number;
    }) => {
      const { id, ...body } = data;
      const res = await api.post<Dataset>(`/datasets/${id}/subscribe`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datasets"] }),
  });
}

export function useUnsubscribeDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<Dataset>(`/datasets/${id}/unsubscribe`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datasets"] }),
  });
}

export function useSyncDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<Dataset>(`/datasets/${id}/sync`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datasets"] }),
  });
}

export function useDownloadDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<Dataset>(`/datasets/${id}/download`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datasets"] }),
  });
}

export function useDatasetPresets() {
  return useQuery({
    queryKey: ["datasets", "presets"],
    queryFn: async () => {
      const res = await api.get<PresetDataset[]>("/datasets/presets");
      return res.data;
    },
  });
}

/**
 * Subscribe to import progress via SSE.
 * Returns a cleanup function.
 */
export function subscribeImportProgress(
  jobId: string,
  onProgress: (data: { status: string; phase: string; progress: number; error: string }) => void,
): () => void {
  const baseUrl = api.defaults.baseURL || "";
  const url = `${baseUrl}/datasets/import-progress/${encodeURIComponent(jobId)}`;
  const eventSource = new EventSource(url);
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onProgress(data);
      if (data.status === "done" || data.status === "failed" || data.status === "not_found") {
        eventSource.close();
      }
    } catch { /* ignore parse errors */ }
  };
  eventSource.onerror = () => {
    eventSource.close();
  };
  return () => eventSource.close();
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

export function useDatasetVersions(id: string) {
  return useQuery({
    queryKey: ["datasets", id, "versions"],
    queryFn: async () => {
      const res = await api.get<DatasetVersion[]>(`/datasets/${id}/versions`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useDatasetStats(id: string, version?: number) {
  return useQuery({
    queryKey: ["datasets", id, "stats", version],
    queryFn: async () => {
      const params = version != null ? { version } : {};
      const res = await api.get<DatasetStats>(`/datasets/${id}/stats`, { params });
      return res.data;
    },
    enabled: !!id,
  });
}

export function useSyncLogs(id: string) {
  return useQuery({
    queryKey: ["datasets", id, "sync-logs"],
    queryFn: async () => {
      const res = await api.get<SyncLog[]>(`/datasets/${id}/sync-logs`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function usePreflightImport() {
  return useMutation({
    mutationFn: async (data: FormData) => {
      const res = await api.post<PreflightResult>("/datasets/preflight", data);
      return res.data;
    },
  });
}

export function useConfirmImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      preflight_token: string;
      name: string;
      description?: string;
      tags?: string;
    }) => {
      const res = await api.post<Dataset>("/datasets/confirm", data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datasets"] }),
  });
}

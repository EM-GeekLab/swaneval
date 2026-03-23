import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { LLMModel, PlaygroundResponse } from "@/lib/types";

export function useModels() {
  return useQuery({
    queryKey: ["models"],
    queryFn: async () => {
      const res = await api.get<LLMModel[]>("/models");
      return res.data;
    },
    staleTime: 30_000,
  });
}

export function useCreateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      provider: string;
      endpoint_url: string;
      api_key?: string;
      model_type: string;
      api_format?: string;
      description?: string;
      model_name?: string;
      max_tokens?: number;
      source_model_id?: string;
    }) => {
      const res = await api.post<LLMModel>("/models", data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["models"] }),
  });
}

export function useUpdateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      endpoint_url?: string;
      api_key?: string;
      api_format?: string;
      description?: string;
      model_name?: string;
      max_tokens?: number | null;
    }) => {
      const res = await api.put<LLMModel>(`/models/${id}`, data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["models"] }),
  });
}

export function useDeleteModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/models/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["models"] }),
  });
}

export function useTestModel() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<{ ok: boolean; message: string }>(
        `/models/${id}/test`
      );
      return res.data;
    },
  });
}

export function usePlayground() {
  return useMutation({
    mutationFn: async (data: { model_id: string; prompt: string; temperature?: number; max_tokens?: number }) => {
      const { model_id, ...body } = data;
      const res = await api.post<PlaygroundResponse>(`/models/${model_id}/playground`, body);
      return res.data;
    },
  });
}

export function useActiveDeployments() {
  return useQuery({
    queryKey: ["models", "deployments"],
    queryFn: async () => {
      const res = await api.get<LLMModel[]>("/models/deployments");
      return res.data;
    },
  });
}

export function useDeployModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { model_id: string; cluster_id: string; gpu_count?: number; memory_gb?: number }) => {
      const { model_id, ...params } = data;
      const res = await api.post<{ status: string; endpoint_url: string; deployment_name: string }>(
        `/models/${model_id}/deploy`, null, { params },
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["models"] }),
  });
}

export function useUndeployModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (model_id: string) => {
      const res = await api.post<{ status: string }>(`/models/${model_id}/undeploy`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["models"] }),
  });
}

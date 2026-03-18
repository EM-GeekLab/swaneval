import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { LLMModel } from "@/lib/types";

export function useModels() {
  return useQuery({
    queryKey: ["models"],
    queryFn: async () => {
      const res = await api.get<LLMModel[]>("/models");
      return res.data;
    },
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
      description?: string;
      model_name?: string;
      max_tokens?: number;
    }) => {
      const res = await api.post<LLMModel>("/models", data);
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

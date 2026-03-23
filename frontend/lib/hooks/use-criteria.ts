import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Criterion, PresetCriterion, JudgeTemplate } from "@/lib/types";

export function useCriteria() {
  return useQuery({
    queryKey: ["criteria"],
    queryFn: async () => {
      const res = await api.get<Criterion[]>("/criteria");
      return res.data;
    },
    staleTime: 60_000,
  });
}

export function useCreateCriterion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; type: string; config_json: string }) => {
      const res = await api.post<Criterion>("/criteria", data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["criteria"] }),
  });
}

export function useCriteriaPresets() {
  return useQuery({
    queryKey: ["criteria", "presets"],
    queryFn: async () => {
      const res = await api.get<PresetCriterion[]>("/criteria/presets");
      return res.data;
    },
    staleTime: 60_000,
  });
}

export function useUpdateCriterion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { id: string; name?: string; config_json?: string }) => {
      const { id, ...body } = data;
      const res = await api.put<Criterion>(`/criteria/${id}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["criteria"] }),
  });
}

export function useDeleteCriterion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/criteria/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["criteria"] }),
  });
}

export function useTestCriterion() {
  return useMutation({
    mutationFn: async (data: {
      criterion_id: string;
      prompt: string;
      expected: string;
      actual: string;
    }) => {
      const res = await api.post<{ score: number; criterion: string; type: string }>(
        "/criteria/test",
        data
      );
      return res.data;
    },
  });
}

export function useJudgeTemplates() {
  return useQuery({
    queryKey: ["criteria", "templates"],
    queryFn: async () => {
      const res = await api.get<JudgeTemplate[]>("/criteria/templates");
      return res.data;
    },
    staleTime: 60_000,
  });
}

export function useCreateJudgeTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; system_prompt: string; dimensions?: unknown[]; scale?: number }) => {
      const res = await api.post<JudgeTemplate>("/criteria/templates", data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["criteria", "templates"] }),
  });
}

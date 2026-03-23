import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { ExternalBenchmark } from "@/lib/types";

export function useBenchmarks(modelName?: string, benchmarkName?: string) {
  return useQuery({
    queryKey: ["benchmarks", modelName, benchmarkName],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (modelName) params.model_name = modelName;
      if (benchmarkName) params.benchmark_name = benchmarkName;
      const res = await api.get<ExternalBenchmark[]>("/benchmarks", { params });
      return res.data;
    },
    staleTime: 60_000,
  });
}

export function useCreateBenchmarkBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: Array<{
      model_name: string;
      provider?: string;
      benchmark_name: string;
      score: number;
      score_display?: string;
      source_url?: string;
      source_platform?: string;
    }>) => {
      const res = await api.post<ExternalBenchmark[]>("/benchmarks/batch", { items });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["benchmarks"] }),
  });
}

export function useDeleteBenchmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/benchmarks/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["benchmarks"] }),
  });
}

export function usePullBenchmarks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      source?: string;
      model_filter?: string;
      limit?: number;
      auto_import?: boolean;
    }) => {
      const res = await api.post<{ source: string; count?: number; imported?: number; preview?: unknown[] }>(
        "/benchmarks/pull",
        null,
        { params: data },
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["benchmarks"] }),
  });
}

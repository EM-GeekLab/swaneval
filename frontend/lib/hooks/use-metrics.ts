import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export interface DashboardMetrics {
  task_counts: Record<string, number>;
  recent_activity: {
    date: string | null;
    total: number;
    completed: number;
    failed: number;
  }[];
  score_distribution: Record<string, number>;
  latency: {
    avg_ms: number;
    min_ms: number;
    max_ms: number;
    total_evaluations: number;
    avg_tokens: number;
  };
}

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ["metrics", "dashboard"],
    queryFn: async () => {
      const res = await api.get<DashboardMetrics>("/metrics/dashboard");
      return res.data;
    },
    refetchInterval: 30000,
  });
}

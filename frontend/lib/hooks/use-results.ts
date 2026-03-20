import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { EvalResult, LeaderboardEntry, TaskSummaryEntry, PaginatedResponse } from "@/lib/types";

export function useResults(taskId?: string, page = 1, pageSize = 50, enabled = true) {
  return useQuery({
    queryKey: ["results", taskId, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (taskId) params.task_id = taskId;
      const res = await api.get<PaginatedResponse<EvalResult>>("/results", { params });
      return res.data;
    },
    enabled,
  });
}

export function useLeaderboard(criterionId?: string) {
  return useQuery({
    queryKey: ["leaderboard", criterionId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (criterionId) params.criterion_id = criterionId;
      const res = await api.get<LeaderboardEntry[]>("/results/leaderboard", { params });
      return res.data;
    },
  });
}

export function useTaskSummary(taskId: string, refetchInterval?: number | false) {
  return useQuery({
    queryKey: ["results", "summary", taskId],
    queryFn: async () => {
      const res = await api.get<TaskSummaryEntry[]>("/results/summary", {
        params: { task_id: taskId },
      });
      return res.data;
    },
    enabled: !!taskId,
    refetchInterval,
  });
}

export function useErrorResults(taskId: string, page = 1, pageSize = 50, refetchInterval?: number | false) {
  return useQuery({
    queryKey: ["results", "errors", taskId, page, pageSize],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<EvalResult>>("/results/errors", {
        params: { task_id: taskId, page, page_size: pageSize },
      });
      return res.data;
    },
    enabled: !!taskId,
    refetchInterval,
  });
}

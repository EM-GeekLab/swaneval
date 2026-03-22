import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { EvalSubtask, EvalTask, QueueStatus, StabilityStats } from "@/lib/types";

/**
 * Fetch tasks list. Only polls when active tasks exist.
 * Pass `poll=false` to disable polling entirely (e.g. for static dropdowns).
 */
export function useTasks(status?: string, poll = true) {
  return useQuery({
    queryKey: ["tasks", status],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (status) params.status_filter = status;
      const res = await api.get<EvalTask[]>("/tasks", { params });
      return res.data;
    },
    refetchInterval: poll
      ? (query) => {
          const tasks = query.state.data as EvalTask[] | undefined;
          const hasActive = tasks?.some(
            (t) => t.status === "running" || t.status === "pending",
          );
          return hasActive ? 5000 : false;
        }
      : false,
  });
}

/**
 * Fetch single task. Only polls while running/pending.
 */
export function useTask(id: string) {
  return useQuery({
    queryKey: ["tasks", id],
    queryFn: async () => {
      const res = await api.get<EvalTask>(`/tasks/${id}`);
      return res.data;
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const task = query.state.data as EvalTask | undefined;
      const isActive =
        task?.status === "running" || task?.status === "pending";
      return isActive ? 3000 : false;
    },
  });
}

/**
 * Fetch subtasks for a task. Always polls when enabled (subtasks are short-lived).
 */
export function useSubtasks(taskId: string) {
  return useQuery({
    queryKey: ["tasks", taskId, "subtasks"],
    queryFn: async () => {
      const res = await api.get<EvalSubtask[]>(`/tasks/${taskId}/subtasks`);
      return res.data;
    },
    enabled: !!taskId,
    refetchInterval: 3000,
  });
}

export function useQueueStatus() {
  return useQuery({
    queryKey: ["tasks", "queue-status"],
    queryFn: async () => {
      const res = await api.get<QueueStatus>("/tasks/queue-status");
      return res.data;
    },
    refetchInterval: 5000,
  });
}

export function useStabilityStats(taskId: string) {
  return useQuery({
    queryKey: ["results", "stability-stats", taskId],
    queryFn: async () => {
      const res = await api.get<StabilityStats[]>("/results/stability-stats", {
        params: { task_id: taskId },
      });
      return res.data;
    },
    enabled: !!taskId,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      model_id: string;
      dataset_ids: string[];
      criteria_ids: string[];
      params_json?: string;
      repeat_count?: number;
      seed_strategy?: string;
      gpu_ids?: string;
      env_vars?: string;
      execution_backend?: string;
      cluster_id?: string;
      resource_config?: string;
    }) => {
      const res = await api.post<EvalTask>("/tasks", data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function usePauseTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<EvalTask>(`/tasks/${id}/pause`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useResumeTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<EvalTask>(`/tasks/${id}/resume`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useRestartTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<EvalTask>(`/tasks/${id}/restart`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["results"] });
    },
  });
}

export function useCancelTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<EvalTask>(`/tasks/${id}/cancel`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/tasks/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["results"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

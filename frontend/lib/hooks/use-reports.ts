import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Report, ReportListItem } from "@/lib/types";

export type ReportType = "performance" | "safety" | "cost" | "value";

export function useReport(taskId: string, reportType: ReportType) {
  return useQuery({
    queryKey: ["reports", taskId, reportType],
    queryFn: async () => {
      const res = await api.post<Record<string, unknown>>("/reports/generate", null, {
        params: { task_id: taskId, report_type: reportType },
      });
      return res.data;
    },
    enabled: !!taskId,
    staleTime: 0,
  });
}

export function useReportList(taskId?: string) {
  return useQuery({
    queryKey: ["reports", taskId],
    queryFn: async () => {
      const params = taskId ? { task_id: taskId } : {};
      const res = await api.get<ReportListItem[]>("/reports", { params });
      return res.data;
    },
    staleTime: 30_000,
  });
}

export function useReportDetail(reportId: string) {
  return useQuery({
    queryKey: ["reports", "detail", reportId],
    queryFn: async () => {
      const res = await api.get<Report>(`/reports/${reportId}`);
      return res.data;
    },
    enabled: !!reportId,
    staleTime: 60_000,
  });
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { task_id: string; report_type: string }) => {
      const res = await api.post<Report>("/reports", null, {
        params: data,
      });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });
}

export function useExportReport() {
  return useMutation({
    mutationFn: async (data: {
      taskId: string;
      reportType: ReportType;
      format: "csv" | "html" | "docx";
    }) => {
      const res = await api.post(`/reports/export/${data.format}`, null, {
        params: { task_id: data.taskId, report_type: data.reportType },
        responseType: "blob",
      });
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = data.format;
      a.download = `${data.reportType}_report.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
}

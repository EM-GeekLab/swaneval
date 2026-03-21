import { utc } from "@/lib/utils";

export const statusLabel: Record<string, string> = {
  completed: "已完成",
  running: "运行中",
  failed: "失败",
  pending: "等待中",
  paused: "已暂停",
  cancelled: "已取消",
};

export const statusBadgeVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline" | "warning"
> = {
  completed: "default",
  running: "secondary",
  failed: "destructive",
  pending: "outline",
  paused: "outline",
  cancelled: "warning",
};

/**
 * Estimate remaining time based on elapsed time and progress percentage.
 * Returns null if not enough data (< 60s elapsed or < 1% progress).
 */
export function estimateEta(
  startedAt: string | null,
  progressPct: number,
): string | null {
  if (!startedAt || progressPct < 1) return null;
  const elapsed = (Date.now() - (utc(startedAt)?.getTime() ?? Date.now())) / 1000;
  if (elapsed < 60) return null;
  const remaining = (elapsed / progressPct) * (100 - progressPct);
  const m = Math.floor(remaining / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `约 ${h}h${m % 60}m`;
  if (m > 0) return `约 ${m}m`;
  return `约 ${Math.round(remaining)}s`;
}

export function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "\u2014";
  const s = utc(start)!.getTime();
  const e = end ? utc(end)!.getTime() : Date.now();
  const diff = Math.max(0, e - s);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分${seconds % 60}秒`;
  const hours = Math.floor(minutes / 60);
  return `${hours}时${minutes % 60}分`;
}

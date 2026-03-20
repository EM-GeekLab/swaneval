import { utc } from "@/lib/utils";

export const statusLabel: Record<string, string> = {
  completed: "已完成",
  running: "运行中",
  failed: "失败",
  pending: "等待中",
  paused: "已暂停",
};

export const statusBadgeVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  completed: "default",
  running: "secondary",
  failed: "destructive",
  pending: "outline",
  paused: "outline",
};

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

"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import Link from "next/link";
import Xarrow, { Xwrapper } from "react-xarrows";
import { Badge } from "@/components/ui/badge";
import {
  Cpu,
  Database,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Activity,
  Zap,
  BarChart3,
} from "lucide-react";
import { useDatasets } from "@/lib/hooks/use-datasets";
import { useModels } from "@/lib/hooks/use-models";
import { useTasks } from "@/lib/hooks/use-tasks";
import { useLeaderboard } from "@/lib/hooks/use-results";
import type { EvalTask } from "@/lib/types";
import { utc } from "@/lib/utils";

const statusVariant = (
  s: EvalTask["status"],
): "default" | "secondary" | "destructive" | "outline" => {
  const map: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    completed: "default",
    running: "secondary",
    failed: "destructive",
    pending: "outline",
    paused: "outline",
  };
  return map[s] || "outline";
};

const statusLabel: Record<string, string> = {
  completed: "已完成",
  running: "运行中",
  failed: "失败",
  pending: "等待中",
  paused: "已暂停",
};

function isVisibleInContainer(
  el: HTMLElement,
  container: HTMLElement,
): boolean {
  const elRect = el.getBoundingClientRect();
  const cRect = container.getBoundingClientRect();
  const centerY = elRect.top + elRect.height / 2;
  return centerY > cRect.top + 10 && centerY < cRect.bottom - 10;
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = utc(start)!.getTime();
  const e = end ? utc(end)!.getTime() : Date.now();
  const diff = Math.max(0, e - s);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export default function OverviewPage() {
  const datasets = useDatasets();
  const models = useModels();
  const tasks = useTasks();
  const { data: leaderboard = [] } = useLeaderboard();

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  const handleScroll = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    if (left) left.addEventListener("scroll", handleScroll, { passive: true });
    if (right)
      right.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (left) left.removeEventListener("scroll", handleScroll);
      if (right) right.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);

  // Live tick for running task durations
  const allTasks = tasks.data ?? [];
  const hasRunning = allTasks.some((t) => t.status === "running");
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasRunning]);

  const recentTasks = allTasks.slice(0, 20);
  const runningTasks = allTasks.filter((t) => t.status === "running");
  const failedTasks = allTasks.filter((t) => t.status === "failed").slice(0, 20);
  const completedCount = allTasks.filter((t) => t.status === "completed").length;
  const totalCount = allTasks.length;

  // Top model from leaderboard
  const topModel = leaderboard.length > 0 ? leaderboard[0] : null;

  // Connection lines
  const failedIdsInRecent = new Set(
    recentTasks.filter((t) => t.status === "failed").map((t) => t.id),
  );
  const connectedIds = failedTasks
    .filter((t) => failedIdsInRecent.has(t.id))
    .map((t) => t.id);
  const visibleConnections = connectedIds.filter((id) => {
    const leftEl = document.getElementById(`task-left-${id}`);
    const rightEl = document.getElementById(`task-right-${id}`);
    const leftContainer = leftScrollRef.current;
    const rightContainer = rightScrollRef.current;
    if (!leftEl || !rightEl || !leftContainer || !rightContainer) return false;
    return (
      isVisibleInContainer(leftEl, leftContainer) &&
      isVisibleInContainer(rightEl, rightContainer)
    );
  });

  // Success rate
  const successRate = totalCount > 0
    ? Math.round((completedCount / totalCount) * 100)
    : 0;

  return (
    <Xwrapper>
      <div className="dashboard-hero-bg flex flex-col h-[calc(100vh-3.5rem)] -m-6">
        <div className="d-blob" />

        {/* ── Top HUD bar ── */}
        <div className="relative z-10 shrink-0 px-6 pt-5 pb-3">
          <div className="flex items-start justify-between">
            {/* Left: title */}
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground/90 leading-none">
                概览
              </h1>
              <p className="text-[11px] text-muted-foreground mt-1">
                系统状态总览
              </p>
            </div>

            {/* Right: HUD metric chips */}
            <div className="flex items-center gap-1">
              {[
                {
                  icon: Cpu,
                  label: "模型",
                  value: models.data?.length ?? 0,
                  href: "/models",
                },
                {
                  icon: Database,
                  label: "数据集",
                  value:
                    (datasets.data as { total?: number })?.total ??
                    (datasets.data as { items?: unknown[] })?.items?.length ??
                    0,
                  href: "/datasets",
                },
                {
                  icon: Activity,
                  label: "任务",
                  value: totalCount,
                  href: "/tasks",
                },
                {
                  icon: CheckCircle2,
                  label: "完成",
                  value: completedCount,
                  href: "/results",
                },
              ].map((m) => (
                <Link
                  key={m.label}
                  href={m.href}
                  className="group flex items-center gap-1.5 rounded-md border border-transparent hover:border-border bg-card/40 hover:bg-card/70 backdrop-blur-sm px-3 py-1.5 transition-all"
                >
                  <m.icon className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-lg font-semibold tabular-nums leading-none">
                    {m.value}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {m.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ── Middle: status strip ── */}
        <div className="relative z-10 shrink-0 px-6 pb-4">
          <div className="flex items-center gap-4 text-xs">
            {/* Success rate */}
            <div className="flex items-center gap-2.5">
              <span className="text-muted-foreground whitespace-nowrap">成功率</span>
              <div className="w-28 h-1.5 rounded-full bg-border/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${successRate}%` }}
                />
              </div>
              <span className="font-semibold tabular-nums text-foreground w-8 text-right">
                {successRate}%
              </span>
            </div>

            <div className="w-px h-4 bg-border/50" />

            {/* Running indicator */}
            {runningTasks.length > 0 && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                  </span>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground tabular-nums">
                      {runningTasks.length}
                    </span>{" "}
                    运行中
                  </span>
                </div>
                <div className="w-px h-4 bg-border/50" />
              </>
            )}

            {/* Failed indicator */}
            {failedTasks.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 text-destructive/70">
                  <AlertTriangle className="h-3 w-3" />
                  <span className="tabular-nums">{failedTasks.length} 失败</span>
                </div>
                <div className="w-px h-4 bg-border/50" />
              </>
            )}

            {/* Top model */}
            {topModel && (
              <Link
                href="/results"
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors ml-auto"
              >
                <BarChart3 className="h-3 w-3" />
                <span>
                  最佳{" "}
                  <span className="font-medium text-foreground">
                    {topModel.model_name}
                  </span>{" "}
                  <span className="tabular-nums">
                    {(topModel.avg_score * 100).toFixed(1)}%
                  </span>
                </span>
              </Link>
            )}
          </div>
        </div>

        {/* ── Main: 3-column grid ── */}
        <div className="relative z-10 flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-3 px-6 pb-5">
          {/* Col 1: Recent tasks */}
          <div className="flex flex-col min-h-0 rounded-lg border border-border/50 bg-card/40 backdrop-blur-sm">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="h-3 w-3" />
                最近任务
              </div>
              <Link
                href="/tasks"
                className="text-[10px] text-muted-foreground/60 hover:text-foreground flex items-center gap-0.5 transition-colors"
              >
                全部 <ArrowRight className="h-2.5 w-2.5" />
              </Link>
            </div>
            <div className="flex-1 overflow-auto" ref={leftScrollRef}>
              {recentTasks.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs text-muted-foreground">
                    暂无任务。{" "}
                    <Link
                      href="/tasks"
                      className="text-primary hover:underline"
                    >
                      创建一个
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="p-1.5 space-y-0.5">
                  {recentTasks.map((t) => (
                    <Link
                      key={t.id}
                      id={`task-left-${t.id}`}
                      href={`/tasks/${t.id}`}
                      className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-accent/40 transition-colors group"
                    >
                      <div className="min-w-0 flex-1 mr-2">
                        <p className="truncate text-xs font-medium leading-tight">
                          {t.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 tabular-nums">
                          {utc(t.created_at)?.toLocaleString()}
                        </p>
                      </div>
                      <Badge
                        variant={statusVariant(t.status)}
                        className="shrink-0 text-[10px] h-5"
                      >
                        {statusLabel[t.status] ?? t.status}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Col 2: Running tasks with live progress */}
          <div className="flex flex-col min-h-0 rounded-lg border border-border/50 bg-card/40 backdrop-blur-sm">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Zap className="h-3 w-3" />
                运行中
                {runningTasks.length > 0 && (
                  <span className="tabular-nums text-foreground">
                    {runningTasks.length}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {runningTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <Activity className="h-5 w-5 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground/50">
                    暂无运行中的任务
                  </p>
                </div>
              ) : (
                <div className="p-2 space-y-2">
                  {runningTasks.map((t) => (
                    <Link
                      key={t.id}
                      href={`/tasks/${t.id}`}
                      className="block rounded-md border border-border/40 p-2.5 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-medium truncate flex-1 mr-2">
                          {t.name}
                        </p>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {formatDuration(t.started_at, null)}
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary/60 animate-pulse" style={{ width: "60%" }} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Col 3: Failed tasks */}
          <div className="flex flex-col min-h-0 rounded-lg border border-border/50 bg-card/40 backdrop-blur-sm">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <AlertTriangle className="h-3 w-3 text-destructive/50" />
                失败任务
              </div>
              {failedTasks.length > 0 && (
                <span className="text-[10px] text-destructive/60 tabular-nums">
                  {failedTasks.length} 项
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto" ref={rightScrollRef}>
              {failedTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <CheckCircle2 className="h-5 w-5 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground/50">
                    暂无失败任务
                  </p>
                </div>
              ) : (
                <div className="p-1.5 space-y-0.5">
                  {failedTasks.map((t) => (
                    <Link
                      key={t.id}
                      id={`task-right-${t.id}`}
                      href={`/tasks/${t.id}`}
                      className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-destructive/5 transition-colors"
                    >
                      <div className="min-w-0 flex-1 mr-2">
                        <p className="truncate text-xs font-medium leading-tight">
                          {t.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 tabular-nums">
                          {utc(t.created_at)?.toLocaleString()}
                        </p>
                      </div>
                      <Badge
                        variant="destructive"
                        className="shrink-0 text-[10px] h-5"
                      >
                        失败
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Connection lines */}
          {visibleConnections.map((id) => (
            <Xarrow
              key={id}
              start={`task-left-${id}`}
              end={`task-right-${id}`}
              color="hsl(0 72% 51% / 0.12)"
              strokeWidth={1}
              curveness={0.3}
              startAnchor="right"
              endAnchor="left"
              showHead={false}
              zIndex={5}
            />
          ))}
        </div>
      </div>
    </Xwrapper>
  );
}

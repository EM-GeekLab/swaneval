"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Cpu,
  Database,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Activity,
  Zap,
  BarChart3,
  Ruler,
  TrendingUp,
} from "lucide-react";
import { useDatasets } from "@/lib/hooks/use-datasets";
import { useModels } from "@/lib/hooks/use-models";
import { useTasks } from "@/lib/hooks/use-tasks";
import { useCriteria } from "@/lib/hooks/use-criteria";
import { useLeaderboard } from "@/lib/hooks/use-results";

export default function OverviewPage() {
  const datasets = useDatasets();
  const models = useModels();
  const { data: criteria = [] } = useCriteria();
  const tasks = useTasks();
  const { data: leaderboard = [] } = useLeaderboard();

  const [, setTick] = useState(0);
  const allTasks = tasks.data ?? [];
  const hasRunning = allTasks.some((t) => t.status === "running");
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasRunning]);

  const runningCount = allTasks.filter((t) => t.status === "running").length;
  const failedCount = allTasks.filter((t) => t.status === "failed").length;
  const completedCount = allTasks.filter((t) => t.status === "completed").length;
  const pendingCount = allTasks.filter((t) => t.status === "pending").length;
  const totalCount = allTasks.length;
  const successRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const topModel = leaderboard.length > 0 ? leaderboard[0] : null;
  const datasetCount =
    (datasets.data as { total?: number })?.total ??
    (datasets.data as { items?: unknown[] })?.items?.length ?? 0;
  const modelCount = models.data?.length ?? 0;

  // Mini bar data: score distribution from leaderboard
  const scoreBars = useMemo(() => {
    if (leaderboard.length === 0) return [];
    const unique = new Map<string, number>();
    for (const e of leaderboard) {
      if (!unique.has(e.model_id)) unique.set(e.model_id, e.avg_score);
    }
    return Array.from(unique.values())
      .sort((a, b) => b - a)
      .slice(0, 8);
  }, [leaderboard]);

  // Task distribution for donut-like visualization
  const taskSegments = useMemo(() => {
    if (totalCount === 0) return [];
    return [
      { label: "完成", count: completedCount, color: "bg-primary" },
      { label: "运行", count: runningCount, color: "bg-amber-500" },
      { label: "失败", count: failedCount, color: "bg-destructive" },
      { label: "等待", count: pendingCount, color: "bg-muted-foreground/30" },
    ].filter((s) => s.count > 0);
  }, [totalCount, completedCount, runningCount, failedCount, pendingCount]);

  return (
    <div className="dashboard-hero-bg flex flex-col h-[calc(100vh-3.5rem)] -m-6">
      <div className="d-blob" />

      {/* ── Hero: centered title + subtle metrics ── */}
      <div className="relative z-10 flex flex-col items-center justify-center pt-12 pb-6 px-6">
        <h1 className="text-3xl font-bold tracking-tight mb-1">SwanEVAL</h1>
        <p className="text-sm text-muted-foreground">
          企业级大模型评测平台
        </p>

        {/* Status strip */}
        <div className="flex items-center gap-4 mt-5 text-xs text-muted-foreground">
          {runningCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
              </span>
              <span className="font-semibold text-foreground tabular-nums">{runningCount}</span>
              <span>运行中</span>
            </div>
          )}
          {failedCount > 0 && (
            <div className="flex items-center gap-1.5 text-destructive/70">
              <AlertTriangle className="h-3 w-3" />
              <span className="tabular-nums">{failedCount}</span>
              <span>失败</span>
            </div>
          )}
          {topModel && (
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" />
              <span>
                最佳 <span className="font-medium text-foreground">{topModel.model_name}</span>{" "}
                <span className="tabular-nums">{(topModel.avg_score * 100).toFixed(1)}%</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Resource counters: quiet horizontal bar ── */}
      <div className="relative z-10 shrink-0 px-6 pb-6">
        <div className="flex items-center justify-center gap-8">
          {[
            { icon: Cpu, label: "模型", value: modelCount, href: "/models" },
            { icon: Database, label: "数据集", value: datasetCount, href: "/datasets" },
            { icon: Ruler, label: "评测标准", value: criteria.length, href: "/criteria" },
            { icon: Activity, label: "任务", value: totalCount, href: "/tasks" },
            { icon: BarChart3, label: "评测记录", value: leaderboard.length, href: "/results" },
          ].map((m) => (
            <Link
              key={m.label}
              href={m.href}
              className="group flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <m.icon className="h-3.5 w-3.5 group-hover:text-primary transition-colors" />
              <span className="text-lg font-semibold tabular-nums text-foreground">{m.value}</span>
              <span className="text-xs">{m.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Main panels: abstract info + graphs ── */}
      <div className="relative z-10 flex-1 min-h-0 grid grid-cols-12 gap-4 px-6 pb-6">

        {/* Left: Task health — filled accent card */}
        <div className="col-span-4 rounded-2xl bg-primary/[0.06] border border-primary/10 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">任务概况</span>
            </div>
            <Link
              href="/tasks"
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
            >
              查看 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Success rate — large number */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <p className="text-5xl font-bold tabular-nums text-primary">{successRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">成功率</p>

            {/* Segmented bar */}
            {taskSegments.length > 0 && (
              <div className="w-full mt-5 space-y-2">
                <div className="flex h-2 rounded-full overflow-hidden bg-muted/50">
                  {taskSegments.map((seg) => (
                    <div
                      key={seg.label}
                      className={`${seg.color} transition-all duration-500`}
                      style={{ width: `${(seg.count / totalCount) * 100}%` }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
                  {taskSegments.map((seg) => (
                    <div key={seg.label} className="flex items-center gap-1">
                      <div className={`h-1.5 w-1.5 rounded-full ${seg.color}`} />
                      <span>{seg.label} {seg.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {totalCount === 0 && (
              <p className="text-xs text-muted-foreground/40 mt-4 italic">暂无任务数据</p>
            )}
          </div>
        </div>

        {/* Center: Score distribution — bar sparkline */}
        <div className="col-span-5 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">模型得分分布</span>
            </div>
            <Link
              href="/results"
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
            >
              排行榜 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {scoreBars.length > 0 ? (
            <div className="flex-1 flex items-end gap-1.5 pb-2">
              {scoreBars.map((score, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] tabular-nums text-muted-foreground">
                    {(score * 100).toFixed(0)}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-primary/20 transition-all duration-500 min-h-[4px]"
                    style={{ height: `${Math.max(score * 100, 4)}%` }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <BarChart3 className="h-8 w-8 text-muted-foreground/15" />
              <p className="text-xs text-muted-foreground/40">暂无评测数据</p>
            </div>
          )}
        </div>

        {/* Right: Quick status */}
        <div className="col-span-3 flex flex-col gap-4">
          {/* Running indicator */}
          <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-4 flex-1 flex flex-col justify-center">
            {runningCount > 0 ? (
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400/60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                  </span>
                  <span className="text-xs font-medium text-amber-600">运行中</span>
                </div>
                <p className="text-3xl font-bold tabular-nums">{runningCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">个任务</p>
              </div>
            ) : (
              <div className="text-center">
                <CheckCircle2 className="h-5 w-5 text-muted-foreground/20 mx-auto mb-1.5" />
                <p className="text-xs text-muted-foreground/40">队列空闲</p>
              </div>
            )}
          </div>

          {/* Alerts */}
          <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-4 flex-1 flex flex-col justify-center">
            {failedCount > 0 ? (
              <Link href="/tasks" className="text-center group">
                <AlertTriangle className="h-5 w-5 text-destructive/60 mx-auto mb-1.5" />
                <p className="text-3xl font-bold tabular-nums text-destructive">{failedCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 group-hover:text-foreground transition-colors">
                  失败任务 <ArrowRight className="inline h-2.5 w-2.5" />
                </p>
              </Link>
            ) : (
              <div className="text-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-500/40 mx-auto mb-1.5" />
                <p className="text-xs text-muted-foreground/40">无异常</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* App info */}
      <div className="relative z-10 shrink-0 flex items-center justify-center gap-1.5 pb-3 text-[11px] text-muted-foreground/40">
        <span>SwanEVAL</span>
        <span className="font-mono">v{process.env.NEXT_PUBLIC_APP_VERSION}{process.env.NEXT_PUBLIC_BUILD_HASH ? `-${process.env.NEXT_PUBLIC_BUILD_HASH}` : ''}</span>
      </div>
    </div>
  );
}

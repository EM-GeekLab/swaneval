"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  ChevronRight,
} from "lucide-react";
import { useDatasets } from "@/lib/hooks/use-datasets";
import { useModels } from "@/lib/hooks/use-models";
import { useTasks } from "@/lib/hooks/use-tasks";
import { useCriteria } from "@/lib/hooks/use-criteria";
import { useLeaderboard } from "@/lib/hooks/use-results";
import { utc } from "@/lib/utils";

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

  const runningTasks = allTasks.filter((t) => t.status === "running");
  const failedTasks = allTasks.filter((t) => t.status === "failed").slice(0, 5);
  const recentCompleted = allTasks.filter((t) => t.status === "completed").slice(0, 5);
  const completedCount = allTasks.filter((t) => t.status === "completed").length;
  const totalCount = allTasks.length;
  const successRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const topModel = leaderboard.length > 0 ? leaderboard[0] : null;
  const datasetCount =
    (datasets.data as { total?: number })?.total ??
    (datasets.data as { items?: unknown[] })?.items?.length ?? 0;
  const modelCount = models.data?.length ?? 0;

  // Pipeline nodes
  const pipelineNodes = [
    {
      icon: Cpu,
      label: "模型",
      count: modelCount,
      href: "/models",
      sub: models.data?.slice(0, 3).map((m) => m.name) ?? [],
    },
    {
      icon: Database,
      label: "数据集",
      count: datasetCount,
      href: "/datasets",
      sub: ((datasets.data as { items?: { name: string }[] })?.items ?? [])
        .slice(0, 3)
        .map((d) => d.name),
    },
    {
      icon: Ruler,
      label: "评测标准",
      count: criteria.length,
      href: "/criteria",
      sub: criteria.slice(0, 3).map((c) => c.name),
    },
    {
      icon: Activity,
      label: "评测任务",
      count: totalCount,
      href: "/tasks",
      sub: allTasks.slice(0, 3).map((t) => t.name),
    },
    {
      icon: BarChart3,
      label: "结果分析",
      count: leaderboard.length,
      href: "/results",
      sub: topModel ? [`最佳: ${topModel.model_name} ${(topModel.avg_score * 100).toFixed(1)}%`] : [],
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">概览</h1>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>成功率</span>
            <div className="w-20 h-1.5 rounded-full bg-border/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${successRate}%` }}
              />
            </div>
            <span className="font-semibold tabular-nums text-foreground">{successRate}%</span>
          </div>
          {runningTasks.length > 0 && (
            <>
              <div className="w-px h-4 bg-border/50" />
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                </span>
                <span className="font-semibold text-foreground tabular-nums">{runningTasks.length}</span> 运行中
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Pipeline flow: connected node cards ── */}
      <div className="grid grid-cols-5 gap-3">
        {pipelineNodes.map((node, i) => (
          <Link key={node.label} href={node.href} className="group">
            <Card className="relative hover:border-primary/40 transition-colors h-full">
              {/* Connection arrow (between nodes) */}
              {i < pipelineNodes.length - 1 && (
                <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-border group-hover:text-primary/40 transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </div>
              )}
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="rounded-md bg-muted p-1.5">
                    <node.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">{node.label}</span>
                  <span className="ml-auto text-xl font-bold tabular-nums">{node.count}</span>
                </div>
                <div className="space-y-0.5">
                  {node.sub.length > 0 ? node.sub.map((name, j) => (
                    <p key={j} className="text-[11px] text-muted-foreground/70 truncate">{name}</p>
                  )) : (
                    <p className="text-[11px] text-muted-foreground/40 italic">暂无数据</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── Status cards grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Running tasks — live progress */}
        <Card>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Zap className="h-3.5 w-3.5" />
              运行中
              {runningTasks.length > 0 && (
                <Badge variant="secondary" className="h-4 text-[10px] px-1.5 ml-1">
                  {runningTasks.length}
                </Badge>
              )}
            </div>
          </div>
          <CardContent className="pt-0 pb-4 px-4">
            {runningTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <Activity className="h-6 w-6 text-muted-foreground/20" />
                <p className="text-xs text-muted-foreground/50">暂无运行中的任务</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {runningTasks.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}`}
                    className="block rounded-lg border p-3 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium truncate flex-1 mr-2">{t.name}</p>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {formatDuration(t.started_at, null)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary/60 animate-pulse" style={{ width: "60%" }} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent completed */}
        <Card>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              最近完成
            </div>
            <Link href="/results" className="text-[10px] text-muted-foreground/60 hover:text-foreground flex items-center gap-0.5 transition-colors">
              查看结果 <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>
          <CardContent className="pt-0 pb-4 px-4">
            {recentCompleted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <CheckCircle2 className="h-6 w-6 text-muted-foreground/20" />
                <p className="text-xs text-muted-foreground/50">暂无已完成任务</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentCompleted.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}`}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
                  >
                    <p className="text-xs truncate flex-1 mr-2">{t.name}</p>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {utc(t.created_at)?.toLocaleDateString()}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Failed tasks */}
        <Card>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive/60" />
              失败任务
              {failedTasks.length > 0 && (
                <Badge variant="destructive" className="h-4 text-[10px] px-1.5 ml-1">
                  {failedTasks.length}
                </Badge>
              )}
            </div>
          </div>
          <CardContent className="pt-0 pb-4 px-4">
            {failedTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <CheckCircle2 className="h-6 w-6 text-muted-foreground/20" />
                <p className="text-xs text-muted-foreground/50">暂无失败任务</p>
              </div>
            ) : (
              <div className="space-y-1">
                {failedTasks.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}`}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-destructive/5 transition-colors"
                  >
                    <p className="text-xs truncate flex-1 mr-2">{t.name}</p>
                    <Badge variant="destructive" className="shrink-0 text-[10px] h-4">失败</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Leaderboard preview ── */}
      {leaderboard.length > 0 && (
        <Card>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5" />
              排行榜 Top 5
            </div>
            <Link href="/results" className="text-[10px] text-muted-foreground/60 hover:text-foreground flex items-center gap-0.5 transition-colors">
              查看全部 <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>
          <CardContent className="pt-0 pb-4 px-4">
            <div className="grid grid-cols-5 gap-2">
              {leaderboard.slice(0, 5).map((entry, i) => (
                <div key={`${entry.model_id}-${entry.criterion_id}`} className="rounded-lg border p-3 text-center">
                  <p className="text-[10px] text-muted-foreground mb-1">#{i + 1}</p>
                  <p className="text-xs font-medium truncate">{entry.model_name}</p>
                  <p className={`text-lg font-bold font-mono ${
                    entry.avg_score >= 0.8 ? "text-emerald-600" : entry.avg_score >= 0.5 ? "text-amber-600" : "text-red-600"
                  }`}>
                    {(entry.avg_score * 100).toFixed(1)}%
                  </p>
                  <Badge variant="outline" className="text-[9px] font-normal mt-1">{entry.criterion_name}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

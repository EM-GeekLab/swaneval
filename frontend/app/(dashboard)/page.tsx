"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Cpu,
  Database,
  ArrowRight,
  Activity,
  Zap,
  BarChart3,
  Ruler,
  Clock,
  Hash,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useDatasets } from "@/lib/hooks/use-datasets";
import { useModels } from "@/lib/hooks/use-models";
import { useTasks } from "@/lib/hooks/use-tasks";
import { useCriteria } from "@/lib/hooks/use-criteria";
import { useLeaderboard } from "@/lib/hooks/use-results";
import { useDashboardMetrics } from "@/lib/hooks/use-metrics";
import { formatDurationSemantic } from "@/lib/time";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const COLORS = {
  primary: "#7C3AED",
  success: "#10b981",
  error: "#dc2626",
  warning: "#f59e0b",
  muted: "#94a3b8",
};

export default function OverviewPage() {
  const datasets = useDatasets();
  const models = useModels();
  const { data: criteria = [] } = useCriteria();
  const tasks = useTasks();
  const { data: leaderboard = [] } = useLeaderboard();
  const { data: metrics } = useDashboardMetrics();

  const allTasks = tasks.data ?? [];
  const tc = metrics?.task_counts ?? {};
  const runningCount = tc.running ?? 0;
  const completedCount = tc.completed ?? 0;
  const failedCount = tc.failed ?? 0;
  const totalTasks = Object.values(tc).reduce((a, b) => a + b, 0);
  const successRate = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : null;

  const datasetCount =
    (datasets.data as { total?: number })?.total ??
    (datasets.data as { items?: unknown[] })?.items?.length ?? 0;
  const modelCount = models.data?.length ?? 0;

  // Score distribution chart data
  const scoreChartData = useMemo(() => {
    const dist = metrics?.score_distribution ?? {};
    const buckets = ["0.0-0.3", "0.3-0.5", "0.5-0.6", "0.6-0.7", "0.7-0.8", "0.8-0.9", "0.9-1.0"];
    return buckets.map((b) => ({
      bucket: b,
      count: dist[b] ?? 0,
    }));
  }, [metrics]);

  const hasScoreData = scoreChartData.some((d) => d.count > 0);

  // Recent activity chart
  const activityData = metrics?.recent_activity ?? [];

  // Latency stats
  const lat = metrics?.latency ?? { avg_ms: 0, min_ms: 0, max_ms: 0, total_evaluations: 0, avg_tokens: 0 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">仪表盘</h1>
        <p className="text-sm text-muted-foreground mt-0.5">系统概览与关键指标</p>
      </div>

      {/* Resource counters */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { icon: Cpu, label: "模型", value: modelCount, href: "/models" },
          { icon: Database, label: "数据集", value: datasetCount, href: "/datasets" },
          { icon: Ruler, label: "评测标准", value: criteria.length, href: "/criteria" },
          { icon: Activity, label: "任务", value: totalTasks, href: "/tasks" },
          { icon: BarChart3, label: "评测记录", value: lat.total_evaluations, href: "/results" },
        ].map((m) => (
          <Link key={m.label} href={m.href}>
            <Card className="hover:border-primary/30 transition-colors">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-primary/10 p-2">
                  <m.icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">{m.value}</p>
                  <p className="text-[11px] text-muted-foreground">{m.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Main metrics grid */}
      <div className="grid grid-cols-12 gap-4">

        {/* Task health */}
        <Card className="col-span-3">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">任务概况</span>
              </div>
              <Link href="/tasks" className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                查看 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {successRate !== null ? (
              <div className="text-center py-2">
                <p className="text-4xl font-bold tabular-nums text-primary">{successRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">成功率</p>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground/30">
                <Zap className="h-6 w-6 mx-auto" />
                <p className="text-xs mt-1">暂无任务</p>
              </div>
            )}
            {totalTasks > 0 && (
              <div className="space-y-1.5 text-xs">
                {[
                  { label: "完成", count: completedCount, color: "bg-primary" },
                  { label: "运行中", count: runningCount, color: "bg-amber-500" },
                  { label: "失败", count: failedCount, color: "bg-destructive" },
                ].filter((s) => s.count > 0).map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${s.color}`} />
                    <span className="text-muted-foreground flex-1">{s.label}</span>
                    <span className="font-medium tabular-nums">{s.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Score distribution */}
        <Card className="col-span-5">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">评分分布</span>
              </div>
              <Link href="/results" className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                排行榜 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {hasScoreData ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={scoreChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(value: number) => [`${value} 条`, "评测数"]}
                    labelFormatter={(label) => `分数区间: ${label}`}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {scoreChartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={
                          entry.bucket.startsWith("0.9") ? COLORS.success
                          : entry.bucket.startsWith("0.8") ? COLORS.primary
                          : entry.bucket.startsWith("0.0") ? COLORS.error
                          : COLORS.muted
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[180px] text-muted-foreground/30">
                <BarChart3 className="h-8 w-8" />
                <p className="text-xs mt-2">暂无评测数据</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance stats */}
        <Card className="col-span-4">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">性能指标</span>
            </div>
            {lat.total_evaluations > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "平均延迟", value: `${lat.avg_ms.toFixed(0)}ms`, icon: Clock },
                  { label: "平均 Token", value: lat.avg_tokens.toFixed(0), icon: Hash },
                  { label: "最低延迟", value: `${lat.min_ms.toFixed(0)}ms`, icon: TrendingUp },
                  { label: "最高延迟", value: `${lat.max_ms.toFixed(0)}ms`, icon: Activity },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border p-3">
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    <p className="text-lg font-bold tabular-nums font-mono">{s.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/30">
                <Clock className="h-6 w-6" />
                <p className="text-xs mt-1">暂无性能数据</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      {activityData.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">近期活动</span>
              </div>
              <span className="text-[11px] text-muted-foreground">最近 7 天</span>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v ? v.slice(5) : ""}
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    value,
                    name === "completed" ? "完成" : name === "failed" ? "失败" : "总计",
                  ]}
                  labelFormatter={(label) => `日期: ${label}`}
                />
                <Bar dataKey="completed" fill={COLORS.primary} radius={[2, 2, 0, 0]} stackId="a" />
                <Bar dataKey="failed" fill={COLORS.error} radius={[2, 2, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* App info */}
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/50">
        <span>SwanEVAL</span>
        <span className="font-mono">v{process.env.NEXT_PUBLIC_APP_VERSION}{process.env.NEXT_PUBLIC_BUILD_HASH ? `-${process.env.NEXT_PUBLIC_BUILD_HASH}` : ''}</span>
      </div>
    </div>
  );
}

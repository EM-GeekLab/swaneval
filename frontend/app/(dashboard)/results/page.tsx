"use client";

import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Download,
  ArrowUpDown,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trophy,
  Globe,
  Trash2,
  Crown,
  FileText,
  FileDown,
  Medal,
  BarChart3,
  Hexagon,
  List,
  Cpu,
  Ruler,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { useLeaderboard, useResults } from "@/lib/hooks/use-results";
import { useBenchmarks, useCreateBenchmarkBatch, useDeleteBenchmark } from "@/lib/hooks/use-benchmarks";
import { useReport, useExportReport, type ReportType } from "@/lib/hooks/use-reports";
import { useCriteria } from "@/lib/hooks/use-criteria";
import { useTasks } from "@/lib/hooks/use-tasks";
import type { LeaderboardEntry, EvalResult } from "@/lib/types";
import { FilterDropdown } from "@/components/filter-dropdown";
import { TablePagination } from "@/components/table-pagination";
import { TableEmpty, TableLoading } from "@/components/table-states";
import { SegmentedControl } from "@/components/segmented-control";

/** Chart palette — primary first, then complementary hues */
const BAR_COLORS = [
  "#7B4BFF", // primary
  "#10b981", // success (emerald)
  "#f59e0b", // warning (amber)
  "#dc2626", // error (red)
  "#9b6dff", // accent
  "#ec4899", // pink
  "#06b6d4", // cyan
];

const PAGE_SIZE = 20;

function scoreColor(score: number): string {
  if (score >= 0.8) return "text-success";
  if (score >= 0.5) return "text-warning";
  return "text-error";
}

function exportCSV(data: LeaderboardEntry[]) {
  const headers = ["模型", "标准", "平均分", "样本数", "平均延迟"];
  const rows = data.map((e) => [
    e.model_name,
    e.criterion_name,
    (e.avg_score * 100).toFixed(1),
    e.total_prompts,
    e.avg_latency_ms.toFixed(0),
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "leaderboard.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ResultsPage() {
  const { data: criteria = [] } = useCriteria();
  const { data: tasks = [] } = useTasks(undefined, false);
  const { data: benchmarks = [] } = useBenchmarks();
  const createBenchmarkBatch = useCreateBenchmarkBatch();
  const deleteBenchmark = useDeleteBenchmark();

  const [activeView, setActiveView] = useState("leaderboard");
  const [criterionFilter, setCriterionFilter] = useState<string>("__all__");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState("");

  // Report tab state
  const [reportTaskId, setReportTaskId] = useState<string>("");
  const [reportType, setReportType] = useState<ReportType>("performance");
  const { data: reportData, isLoading: reportLoading } = useReport(
    reportTaskId, reportType,
  );
  const exportReport = useExportReport();

  // Detail tab state
  const [detailTaskId, setDetailTaskId] = useState<string>("");
  const [detailPage, setDetailPage] = useState(1);

  const { data: leaderboard = [], isLoading: lbLoading } = useLeaderboard(
    criterionFilter === "__all__" ? undefined : criterionFilter,
  );

  const { data: detailData, isLoading: detailLoading } = useResults(
    detailTaskId || undefined,
    detailPage,
    PAGE_SIZE,
    activeView === "detail" && !!detailTaskId,
  );
  const detailResults = detailData?.items ?? [];
  const detailTotal = detailData?.total ?? 0;

  // Stats
  const uniqueModels = useMemo(
    () => new Set(leaderboard.map((e) => e.model_id)).size,
    [leaderboard],
  );
  const uniqueCriteria = useMemo(
    () => new Set(leaderboard.map((e) => e.criterion_id)).size,
    [leaderboard],
  );

  // Bar chart data: group by model, each criterion becomes a key
  const barData = useMemo(() => {
    const modelMap = new Map<
      string,
      { name: string; [key: string]: string | number }
    >();
    for (const entry of leaderboard) {
      if (!modelMap.has(entry.model_id)) {
        modelMap.set(entry.model_id, { name: entry.model_name });
      }
      const row = modelMap.get(entry.model_id)!;
      row[entry.criterion_name] = entry.avg_score;
    }
    return Array.from(modelMap.values());
  }, [leaderboard]);

  // Radar chart data: group by criterion, each model becomes a key
  const radarData = useMemo(() => {
    const criterionMap = new Map<
      string,
      { criterion: string; [key: string]: string | number }
    >();
    for (const entry of leaderboard) {
      if (!criterionMap.has(entry.criterion_id)) {
        criterionMap.set(entry.criterion_id, {
          criterion: entry.criterion_name,
        });
      }
      const row = criterionMap.get(entry.criterion_id)!;
      row[entry.model_name] = entry.avg_score;
    }
    return Array.from(criterionMap.values());
  }, [leaderboard]);

  const modelNames = useMemo(() => {
    const names = new Set<string>();
    for (const entry of leaderboard) names.add(entry.model_name);
    return Array.from(names);
  }, [leaderboard]);

  const criterionNames = useMemo(() => {
    const names = new Set<string>();
    for (const entry of leaderboard) names.add(entry.criterion_name);
    return Array.from(names);
  }, [leaderboard]);

  // ── Champion leaderboard: best model per criterion (local + external) ──
  type ChampionEntry = {
    criterion: string;
    champion: string;
    score: number;
    source: "local" | "external";
    provider?: string;
  };
  const championData = useMemo<ChampionEntry[]>(() => {
    const map = new Map<string, ChampionEntry>();
    // Local results
    for (const entry of leaderboard) {
      const key = entry.criterion_name;
      const existing = map.get(key);
      if (!existing || entry.avg_score > existing.score) {
        map.set(key, {
          criterion: key,
          champion: entry.model_name,
          score: entry.avg_score,
          source: "local",
        });
      }
    }
    // External benchmarks — match by benchmark_name ≈ criterion_name
    for (const b of benchmarks) {
      const key = b.benchmark_name;
      const existing = map.get(key);
      if (!existing || b.score > existing.score) {
        map.set(key, {
          criterion: key,
          champion: b.model_name,
          score: b.score,
          source: "external",
          provider: b.provider,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.score - a.score);
  }, [leaderboard, benchmarks]);

  // ── Merged leaderboard: local results + external benchmarks ──
  const mergedLeaderboard = useMemo(() => {
    const merged: Array<LeaderboardEntry & { source: "local" | "external" }> = [];
    for (const e of leaderboard) {
      merged.push({ ...e, source: "local" as const });
    }
    for (const b of benchmarks) {
      if (criterionFilter !== "__all__") {
        // skip external if criterion filter is active and doesn't match
        const crit = criteria.find((c) => c.id === criterionFilter);
        if (crit && crit.name !== b.benchmark_name) continue;
      }
      merged.push({
        model_id: `ext-${b.id}`,
        model_name: `${b.model_name}${b.provider ? ` (${b.provider})` : ""}`,
        criterion_id: `ext-${b.benchmark_name}`,
        criterion_name: b.benchmark_name,
        avg_score: b.score,
        total_prompts: 0,
        avg_latency_ms: 0,
        source: "external" as const,
      });
    }
    return merged.sort((a, b) => b.avg_score - a.avg_score);
  }, [leaderboard, benchmarks, criterionFilter, criteria]);

  const handleImportBenchmarks = async () => {
    setImportError("");
    try {
      const data = JSON.parse(importJson);
      const items = Array.isArray(data) ? data : [data];
      const mapped = items.map((item: Record<string, unknown>) => ({
        model_name: String(item.model_name || item.model || ""),
        provider: String(item.provider || ""),
        benchmark_name: String(item.benchmark_name || item.benchmark || item.criterion || ""),
        score: Number(item.score ?? item.avg_score ?? 0),
        score_display: String(item.score_display || ""),
        source_url: String(item.source_url || item.url || ""),
        source_platform: String(item.source_platform || item.platform || ""),
      }));
      if (mapped.some((m: { model_name: string; benchmark_name: string }) => !m.model_name || !m.benchmark_name)) {
        setImportError("每条数据需要 model_name 和 benchmark_name 字段");
        return;
      }
      await createBenchmarkBatch.mutateAsync(mapped);
      setImportJson("");
      setImportOpen(false);
    } catch {
      setImportError("JSON 解析失败，请检查格式");
    }
  };

  // ── Leaderboard table columns ──
  const lbColumns = useMemo<ColumnDef<LeaderboardEntry>[]>(
    () => [
      {
        id: "rank",
        size: 40,
        enableResizing: false,
        header: "#",
        cell: ({ row }) => (
          <span className="text-base-content/50 tabular-nums">
            {row.index + 1}
          </span>
        ),
      },
      {
        accessorKey: "model_name",
        header: ({ column }) => (
          <span
            className="flex items-center gap-1 cursor-pointer select-none"
            onClick={column.getToggleSortingHandler()}
          >
            模型
            <ArrowUpDown className="h-3 w-3 text-base-content/30" />
          </span>
        ),
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "criterion_name",
        header: ({ column }) => (
          <span
            className="flex items-center gap-1 cursor-pointer select-none"
            onClick={column.getToggleSortingHandler()}
          >
            标准
            <ArrowUpDown className="h-3 w-3 text-base-content/30" />
          </span>
        ),
        cell: ({ getValue }) => (
          <Badge variant="outline" className="font-normal">
            {getValue<string>()}
          </Badge>
        ),
      },
      {
        accessorKey: "avg_score",
        header: ({ column }) => (
          <span
            className="flex items-center gap-1 cursor-pointer select-none"
            onClick={column.getToggleSortingHandler()}
          >
            平均分
            <ArrowUpDown className="h-3 w-3 text-base-content/30" />
          </span>
        ),
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return (
            <span className={`font-mono font-medium ${scoreColor(v)}`}>
              {(v * 100).toFixed(1)}%
            </span>
          );
        },
      },
      {
        accessorKey: "total_prompts",
        header: ({ column }) => (
          <span
            className="flex items-center gap-1 cursor-pointer select-none"
            onClick={column.getToggleSortingHandler()}
          >
            样本数
            <ArrowUpDown className="h-3 w-3 text-base-content/30" />
          </span>
        ),
        cell: ({ getValue }) => (
          <span className="tabular-nums text-base-content/50">
            {getValue<number>().toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "avg_latency_ms",
        header: ({ column }) => (
          <span
            className="flex items-center gap-1 cursor-pointer select-none"
            onClick={column.getToggleSortingHandler()}
          >
            平均延迟
            <ArrowUpDown className="h-3 w-3 text-base-content/30" />
          </span>
        ),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-base-content/50">
            {getValue<number>().toFixed(0)} ms
          </span>
        ),
      },
    ],
    [],
  );

  const lbTable = useReactTable({
    data: mergedLeaderboard,
    columns: lbColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  // ── Detail table columns ──
  const detailColumns = useMemo<ColumnDef<EvalResult>[]>(
    () => [
      {
        accessorKey: "prompt_text",
        header: "输入提示",
        cell: ({ getValue }) => (
          <span className="block max-w-[200px] truncate text-xs">
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "expected_output",
        header: "预期输出",
        cell: ({ getValue }) => (
          <span className="block max-w-[180px] truncate text-xs text-base-content/50">
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "model_output",
        header: "模型输出",
        cell: ({ getValue }) => (
          <span className="block max-w-[180px] truncate text-xs text-base-content/50">
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "score",
        header: "得分",
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return (
            <span className={`font-mono font-medium text-sm ${scoreColor(v)}`}>
              {(v * 100).toFixed(1)}%
            </span>
          );
        },
      },
      {
        accessorKey: "latency_ms",
        header: "延迟",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-base-content/50">
            {getValue<number>().toFixed(0)} ms
          </span>
        ),
      },
    ],
    [],
  );

  const detailTable = useReactTable({
    data: detailResults,
    columns: detailColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">结果分析</h1>
        <Button
          size="sm"
          variant="outline"
          onClick={() => exportCSV(leaderboard)}
          disabled={leaderboard.length === 0}
        >
          <Download className="mr-1 h-4 w-4" /> 导出 CSV
        </Button>
      </div>

      {/* Summary metric cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "评测记录", value: leaderboard.length, icon: Medal },
          { label: "模型数", value: uniqueModels, icon: Cpu },
          { label: "评测标准", value: uniqueCriteria, icon: Ruler },
          { label: "外部基准", value: benchmarks.length, icon: Globe },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-md bg-base-200 p-2">
                <m.icon className="h-4 w-4 text-base-content/50" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{m.value}</p>
                <p className="text-[11px] text-base-content/50">{m.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sidebar + Content */}
      <div className="flex gap-4 min-h-0">
        {/* Sidebar */}
        <div className="w-48 shrink-0 space-y-1">
          <div className="mb-2">
            <FilterDropdown
              label="标准"
              options={criteria.map((c) => ({ key: c.id, label: c.name }))}
              value={criterionFilter}
              onChange={setCriterionFilter}
            />
          </div>
          {[
            { key: "leaderboard", label: "排行榜", icon: Medal },
            { key: "champion", label: "天梯榜", icon: Trophy },
            { key: "compare", label: "对比", icon: BarChart3 },
            { key: "radar", label: "雷达图", icon: Hexagon },
            { key: "external", label: "外部数据", icon: Globe },
            { key: "reports", label: "报告", icon: FileText },
            { key: "detail", label: "明细", icon: List },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveView(item.key)}
              className={cn(
                "flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm transition-all",
                activeView === item.key
                  ? "bg-base-300/50 text-base-content font-medium"
                  : "text-base-content/40 hover:bg-base-300/30 hover:text-base-content",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">

        {/* ── 排行榜 ── */}
        {activeView === "leaderboard" && (
          <Card>
            <CardContent className="p-0">
              {lbLoading ? (
                <TableLoading />
              ) : leaderboard.length === 0 ? (
                <TableEmpty icon={Medal} title="暂无评测结果" />
              ) : (
                <>
                <Table>
                  <TableHeader>
                    {lbTable.getHeaderGroups().map((hg) => (
                      <TableRow key={hg.id}>
                        {hg.headers.map((header) => (
                          <TableHead key={header.id} className="select-none" style={header.column.id === "rank" ? { width: 40 } : undefined}>
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {lbTable.getRowModel().rows.map((row) => (
                      <TableRow key={row.id} className="hover:bg-base-200/50">
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="py-2.5" style={cell.column.id === "rank" ? { width: 40 } : undefined}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination table={lbTable} />
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── 对比 (Bar Chart) ── */}
        {activeView === "compare" && (
          <Card>
            <CardContent className="pt-6">
              {leaderboard.length === 0 ? (
                <TableEmpty icon={Medal} title="暂无评测结果" />
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 1]} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number) =>
                        `${(value * 100).toFixed(1)}%`
                      }
                    />
                    <Legend />
                    {criterionNames.map((name, idx) => (
                      <Bar
                        key={name}
                        dataKey={name}
                        fill={BAR_COLORS[idx % BAR_COLORS.length]}
                        radius={[2, 2, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── 雷达图 ── */}
        {activeView === "radar" && (
          <Card>
            <CardContent className="pt-6">
              {leaderboard.length === 0 ? (
                <TableEmpty icon={Medal} title="暂无评测结果" />
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis
                      dataKey="criterion"
                      tick={{ fontSize: 12 }}
                    />
                    <PolarRadiusAxis domain={[0, 1]} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(value: number) =>
                        `${(value * 100).toFixed(1)}%`
                      }
                    />
                    <Legend />
                    {modelNames.map((name, idx) => (
                      <Radar
                        key={name}
                        name={name}
                        dataKey={name}
                        stroke={BAR_COLORS[idx % BAR_COLORS.length]}
                        fill={BAR_COLORS[idx % BAR_COLORS.length]}
                        fillOpacity={0.15}
                      />
                    ))}
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── 天梯榜 (Champion per criterion) ── */}
        {activeView === "champion" && (
          <Card>
            <CardContent className="pt-6">
              {championData.length === 0 ? (
                <TableEmpty icon={Medal} title="暂无评测结果" />
              ) : (
                <div className="space-y-2">
                  {championData.map((entry) => (
                    <div
                      key={entry.criterion}
                      className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-base-200/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Crown className="h-4 w-4 text-amber-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{entry.criterion}</p>
                          <p className="text-xs text-base-content/50">
                            {entry.source === "external" ? (
                              <Badge variant="outline" className="text-[10px] font-normal mr-1">外部</Badge>
                            ) : null}
                            {entry.champion}
                            {entry.provider ? ` · ${entry.provider}` : ""}
                          </p>
                        </div>
                      </div>
                      <span className={`font-mono font-bold text-lg ${scoreColor(entry.score)}`}>
                        {(entry.score * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── 外部数据 ── */}
        {activeView === "external" && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold">外部基准测试数据</h3>
                  <p className="text-xs text-base-content/50 mt-0.5">
                    导入闭源模型（GPT、Claude、Gemini 等）的公开评测数据，与本地模型对比
                  </p>
                </div>
                <Button size="sm" onClick={() => setImportOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" /> 导入数据
                </Button>
              </div>

              {benchmarks.length === 0 ? (
                <TableEmpty
                  icon={Globe}
                  title="暂无外部基准数据"
                  description="点击「导入数据」粘贴 JSON 格式的评测数据"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>模型</TableHead>
                      <TableHead>提供商</TableHead>
                      <TableHead>基准测试</TableHead>
                      <TableHead>得分</TableHead>
                      <TableHead>来源</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {benchmarks.map((b) => (
                      <TableRow key={b.id} className="hover:bg-base-200/50">
                        <TableCell className="font-medium">{b.model_name}</TableCell>
                        <TableCell className="text-base-content/50">{b.provider || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">{b.benchmark_name}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className={`font-mono font-medium ${scoreColor(b.score)}`}>
                            {b.score_display || `${(b.score * 100).toFixed(1)}%`}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-base-content/50">
                          {b.source_platform || "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-error hover:text-error"
                            onClick={() => deleteBenchmark.mutate(b.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── 报告生成器 ── */}
        {activeView === "reports" && (
          <Card>
            <CardContent className="p-0">
              {/* Controls */}
              <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-base-content/50 shrink-0">任务</span>
                  <Select value={reportTaskId} onValueChange={setReportTaskId}>
                    <SelectTrigger className="h-9 max-w-xs">
                      <SelectValue placeholder="选择任务..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tasks.filter((t) => t.status === "completed").length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-base-content/50">
                          暂无已完成的任务，<a href="/tasks" className="text-primary hover:underline">去创建</a>
                        </div>
                      ) : tasks.filter((t) => t.status === "completed").map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <SegmentedControl
                  options={[
                    { key: "performance" as const, label: "性能" },
                    { key: "safety" as const, label: "安全" },
                    { key: "cost" as const, label: "成本" },
                    { key: "value" as const, label: "性价比" },
                  ]}
                  value={reportType}
                  onChange={setReportType}
                />
                {reportTaskId && (
                  <div className="flex items-center gap-1 ml-auto">
                    {(["docx", "html", "csv"] as const).map((fmt) => (
                      <Button
                        key={fmt}
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={exportReport.isPending || !reportData}
                        onClick={() => exportReport.mutate({ taskId: reportTaskId, reportType, format: fmt })}
                      >
                        <FileDown className="mr-1 h-3 w-3" />
                        {fmt.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {/* Report content */}
              {!reportTaskId ? (
                <TableEmpty icon={FileText} title="请选择一个已完成的任务生成报告" />
              ) : reportLoading ? (
                <TableLoading text="生成报告中..." />
              ) : !reportData ? (
                <TableEmpty title="暂无数据" />
              ) : (
                <div className="space-y-4 px-4 pb-4">
                  {/* Report header */}
                  <div className="border-b pb-3">
                    <h3 className="text-base font-semibold">{String(reportData.title)}</h3>
                    <p className="text-xs text-base-content/50 mt-1">
                      模型：{String(reportData.model_name)} · 生成时间：{new Date(String(reportData.generated_at)).toLocaleString()}
                    </p>
                  </div>

                  {/* Performance report */}
                  {reportType === "performance" && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-xs text-base-content/50">综合得分</p>
                          <p className={`text-2xl font-bold font-mono ${scoreColor(Number(reportData.overall_score))}`}>
                            {(Number(reportData.overall_score) * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-xs text-base-content/50">评测样本</p>
                          <p className="text-2xl font-bold font-mono">{Number(reportData.total_samples).toLocaleString()}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2">各标准得分</p>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>标准</TableHead>
                              <TableHead>平均分</TableHead>
                              <TableHead>最低</TableHead>
                              <TableHead>最高</TableHead>
                              <TableHead>样本</TableHead>
                              <TableHead>延迟</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(reportData.criteria_breakdown as Array<Record<string, unknown>>)?.map((c, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{String(c.criterion)}</TableCell>
                                <TableCell className={`font-mono ${scoreColor(Number(c.avg_score))}`}>{(Number(c.avg_score) * 100).toFixed(1)}%</TableCell>
                                <TableCell className="font-mono text-base-content/50">{(Number(c.min_score) * 100).toFixed(1)}%</TableCell>
                                <TableCell className="font-mono text-base-content/50">{(Number(c.max_score) * 100).toFixed(1)}%</TableCell>
                                <TableCell className="text-base-content/50">{Number(c.sample_count)}</TableCell>
                                <TableCell className="font-mono text-xs text-base-content/50">{Number(c.avg_latency_ms).toFixed(0)} ms</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}

                  {/* Safety report */}
                  {reportType === "safety" && (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-xs text-base-content/50">错误率</p>
                          <p className={`text-2xl font-bold font-mono ${Number(reportData.error_rate) < 0.1 ? "text-success" : Number(reportData.error_rate) < 0.3 ? "text-warning" : "text-error"}`}>
                            {(Number(reportData.error_rate) * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-xs text-base-content/50">风险等级</p>
                          <p className="text-lg font-bold">{String(reportData.risk_level)}</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-xs text-base-content/50">错误数 / 总数</p>
                          <p className="text-lg font-bold font-mono">{Number(reportData.error_count)} / {Number(reportData.total_samples)}</p>
                        </div>
                      </div>
                      {(reportData.error_cases as Array<Record<string, unknown>>)?.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-2">错误案例（得分最低优先）</p>
                          <div className="space-y-2 max-h-[400px] overflow-auto">
                            {(reportData.error_cases as Array<Record<string, unknown>>).map((c, i) => (
                              <div key={i} className="rounded-md border p-3 text-xs space-y-1.5">
                                <div><span className="text-base-content/50">Prompt：</span>{String(c.prompt).slice(0, 200)}</div>
                                <div><span className="text-base-content/50">预期：</span><span className="text-success">{String(c.expected).slice(0, 200)}</span></div>
                                <div><span className="text-base-content/50">实际：</span><span className="text-error">{String(c.actual).slice(0, 200)}</span></div>
                                <div className="text-right"><Badge variant="outline" className={`text-[10px] ${scoreColor(Number(c.score))}`}>{(Number(c.score) * 100).toFixed(1)}%</Badge></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Cost report */}
                  {reportType === "cost" && (
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "平均延迟", value: `${Number(reportData.avg_latency_ms).toFixed(0)} ms` },
                        { label: "首字延迟", value: `${Number(reportData.avg_first_token_ms).toFixed(0)} ms` },
                        { label: "吞吐量", value: `${Number(reportData.throughput_tokens_per_sec).toFixed(1)} tokens/s` },
                        { label: "总 Token 数", value: Number(reportData.total_tokens).toLocaleString() },
                        { label: "最低延迟", value: `${Number(reportData.min_latency_ms).toFixed(0)} ms` },
                        { label: "最高延迟", value: `${Number(reportData.max_latency_ms).toFixed(0)} ms` },
                        { label: "平均生成长度", value: `${Number(reportData.avg_tokens_per_response).toFixed(0)} tokens` },
                        { label: "运行时长", value: `${Number(reportData.duration_seconds).toFixed(0)} 秒` },
                        { label: "GPU", value: String(reportData.gpu_ids) },
                        { label: "评测样本", value: Number(reportData.total_samples).toLocaleString() },
                      ].map((item) => (
                        <div key={item.label} className="rounded-lg border p-3">
                          <p className="text-xs text-base-content/50">{item.label}</p>
                          <p className="text-lg font-bold font-mono">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Value report */}
                  {reportType === "value" && (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-xs text-base-content/50">性价比指数</p>
                          <p className="text-2xl font-bold font-mono text-primary">{Number(reportData.value_index).toFixed(2)}</p>
                          <p className="text-[11px] text-base-content/50">得分 / 秒延迟</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-xs text-base-content/50">综合得分</p>
                          <p className={`text-2xl font-bold font-mono ${scoreColor(Number(reportData.overall_score))}`}>
                            {(Number(reportData.overall_score) * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-xs text-base-content/50">吞吐量</p>
                          <p className="text-2xl font-bold font-mono">{Number(reportData.throughput_tokens_per_sec).toFixed(1)}</p>
                          <p className="text-[11px] text-base-content/50">tokens/s</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2">各标准性价比</p>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>标准</TableHead>
                              <TableHead>得分</TableHead>
                              <TableHead>延迟</TableHead>
                              <TableHead>样本</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(reportData.criteria_breakdown as Array<Record<string, unknown>>)?.map((c, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{String(c.criterion)}</TableCell>
                                <TableCell className={`font-mono ${scoreColor(Number(c.avg_score))}`}>{(Number(c.avg_score) * 100).toFixed(1)}%</TableCell>
                                <TableCell className="font-mono text-xs text-base-content/50">{Number(c.avg_latency_ms).toFixed(0)} ms</TableCell>
                                <TableCell className="text-base-content/50">{Number(c.sample_count)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── 明细 ── */}
        {activeView === "detail" && (
          <Card>
            <CardContent className="p-0">
              {/* Task filter bar */}
              <div className="flex items-center gap-3 px-4 py-3 border-b">
                <span className="text-xs text-base-content/50 shrink-0">任务</span>
                <Select
                  value={detailTaskId}
                  onValueChange={(v) => {
                    setDetailTaskId(v);
                    setDetailPage(1);
                  }}
                >
                  <SelectTrigger className="h-9 max-w-xs">
                    <SelectValue placeholder="选择任务..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tasks.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-base-content/50">
                        暂无任务，<a href="/tasks" className="text-primary hover:underline">去创建</a>
                      </div>
                    ) : tasks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {detailLoading ? (
                <TableLoading />
              ) : detailResults.length === 0 ? (
                <TableEmpty
                  icon={List}
                  title={detailTaskId ? "该任务暂无明细结果" : "请选择一个任务查看明细"}
                />
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      {detailTable.getHeaderGroups().map((hg) => (
                        <TableRow key={hg.id}>
                          {hg.headers.map((header) => (
                            <TableHead key={header.id}>
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {detailTable.getRowModel().rows.map((row) => (
                        <TableRow key={row.id} className="hover:bg-base-200/50">
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id} className="py-2.5">
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  <div className="flex items-center justify-center gap-2 py-3 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={detailPage <= 1}
                      onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-base-content/50 px-2">
                      第{" "}
                      <span className="font-semibold text-base-content tabular-nums">
                        {detailPage}
                      </span>{" "}
                      / {Math.max(1, Math.ceil(detailTotal / PAGE_SIZE))} 页
                      <span className="ml-1.5">共 {detailTotal} 条</span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={detailPage * PAGE_SIZE >= detailTotal}
                      onClick={() => setDetailPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
        </div>
      </div>

      {/* Import benchmark dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>导入外部评测数据</DialogTitle>
            <DialogDescription>
              粘贴 JSON 数组，每条数据需包含 model_name、benchmark_name、score 字段
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder={`[\n  {\n    "model_name": "GPT-4o",\n    "provider": "OpenAI",\n    "benchmark_name": "MMLU",\n    "score": 0.887,\n    "source_platform": "Open LLM Leaderboard"\n  }\n]`}
              className="flex min-h-[200px] w-full rounded-md border border-base-300 bg-base-200 px-3 py-2 text-xs font-mono ring-offset-base-200 placeholder:text-base-content/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {importError && (
              <p className="text-xs text-error">{importError}</p>
            )}
            <Button
              className="w-full"
              onClick={handleImportBenchmarks}
              disabled={!importJson.trim() || createBenchmarkBatch.isPending}
            >
              {createBenchmarkBatch.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {createBenchmarkBatch.isPending ? "导入中..." : "导入"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

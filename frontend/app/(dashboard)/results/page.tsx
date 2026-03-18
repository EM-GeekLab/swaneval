"use client";

import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
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
  Download,
  ArrowUpDown,
  Loader2,
  ChevronLeft,
  ChevronRight,
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
import { useCriteria } from "@/lib/hooks/use-criteria";
import { useTasks } from "@/lib/hooks/use-tasks";
import type { LeaderboardEntry, EvalResult } from "@/lib/types";

const BAR_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
];

const PAGE_SIZE = 20;

function scoreColor(score: number): string {
  if (score >= 0.8) return "text-emerald-600";
  if (score >= 0.5) return "text-amber-600";
  return "text-red-600";
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
  const { data: tasks = [] } = useTasks();

  const [criterionFilter, setCriterionFilter] = useState<string>("__all__");
  const [sorting, setSorting] = useState<SortingState>([]);

  // Detail tab state
  const [detailTaskId, setDetailTaskId] = useState<string>("");
  const [detailPage, setDetailPage] = useState(1);

  const { data: leaderboard = [], isLoading: lbLoading } = useLeaderboard(
    criterionFilter === "__all__" ? undefined : criterionFilter,
  );

  const { data: detailResults = [], isLoading: detailLoading } = useResults(
    detailTaskId || undefined,
    detailPage,
    PAGE_SIZE,
  );

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

  // ── Leaderboard table columns ──
  const lbColumns = useMemo<ColumnDef<LeaderboardEntry>[]>(
    () => [
      {
        id: "rank",
        header: "#",
        cell: ({ row }) => (
          <span className="text-muted-foreground tabular-nums">
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
            <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
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
            <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
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
            <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
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
            <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
          </span>
        ),
        cell: ({ getValue }) => (
          <span className="tabular-nums text-muted-foreground">
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
            <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
          </span>
        ),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {getValue<number>().toFixed(0)} ms
          </span>
        ),
      },
    ],
    [],
  );

  const lbTable = useReactTable({
    data: leaderboard,
    columns: lbColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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
          <span className="block max-w-[180px] truncate text-xs text-muted-foreground">
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "model_output",
        header: "模型输出",
        cell: ({ getValue }) => (
          <span className="block max-w-[180px] truncate text-xs text-muted-foreground">
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
          <span className="font-mono text-xs text-muted-foreground">
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
        <div className="flex items-center gap-5">
          <h1 className="text-lg font-semibold">结果分析</h1>
          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              共{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {leaderboard.length}
              </span>{" "}
              条记录
            </span>
            <span>
              <span className="font-semibold text-foreground tabular-nums">
                {uniqueModels}
              </span>{" "}
              个模型
            </span>
            <span>
              <span className="font-semibold text-foreground tabular-nums">
                {uniqueCriteria}
              </span>{" "}
              个标准
            </span>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => exportCSV(leaderboard)}
          disabled={leaderboard.length === 0}
        >
          <Download className="mr-1 h-4 w-4" /> 导出 CSV
        </Button>
      </div>

      {/* Toolbar: criterion filter segmented tabs */}
      <div className="flex items-center gap-2">
        <div className="flex items-center h-9 border rounded-md overflow-hidden">
          {[
            { key: "__all__", label: "全部" },
            ...criteria.map((c) => ({ key: c.id, label: c.name })),
          ].map((item, i, arr) => (
            <button
              key={item.key}
              onClick={() =>
                setCriterionFilter(
                  item.key === "__all__"
                    ? "__all__"
                    : criterionFilter === item.key
                      ? "__all__"
                      : item.key,
                )
              }
              className={`h-full px-3.5 text-xs font-medium transition-colors ${
                i < arr.length - 1 ? "border-r" : ""
              } ${
                criterionFilter === item.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs: 排行榜 / 对比 / 雷达图 / 明细 */}
      <Tabs defaultValue="leaderboard">
        <TabsList>
          <TabsTrigger value="leaderboard">排行榜</TabsTrigger>
          <TabsTrigger value="compare">对比</TabsTrigger>
          <TabsTrigger value="radar">雷达图</TabsTrigger>
          <TabsTrigger value="detail">明细</TabsTrigger>
        </TabsList>

        {/* ── 排行榜 ── */}
        <TabsContent value="leaderboard">
          <Card>
            <CardContent className="p-0">
              {lbLoading ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  加载中...
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  暂无评测结果
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    {lbTable.getHeaderGroups().map((hg) => (
                      <TableRow key={hg.id}>
                        {hg.headers.map((header) => (
                          <TableHead key={header.id} className="select-none">
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
                      <TableRow key={row.id} className="hover:bg-muted/50">
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 对比 (Bar Chart) ── */}
        <TabsContent value="compare">
          <Card>
            <CardContent className="pt-6">
              {leaderboard.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  暂无评测结果
                </div>
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
        </TabsContent>

        {/* ── 雷达图 ── */}
        <TabsContent value="radar">
          <Card>
            <CardContent className="pt-6">
              {leaderboard.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  暂无评测结果
                </div>
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
        </TabsContent>

        {/* ── 明细 ── */}
        <TabsContent value="detail">
          <Card>
            <CardContent className="p-0">
              {/* Task filter bar */}
              <div className="flex items-center gap-3 px-4 py-3 border-b">
                <span className="text-xs text-muted-foreground shrink-0">
                  任务筛选
                </span>
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
                    {tasks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {detailLoading ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  加载中...
                </div>
              ) : detailResults.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  {detailTaskId
                    ? "该任务暂无明细结果"
                    : "请选择一个任务查看明细"}
                </div>
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
                        <TableRow key={row.id} className="hover:bg-muted/50">
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
                    <span className="text-xs text-muted-foreground px-2">
                      第{" "}
                      <span className="font-semibold text-foreground tabular-nums">
                        {detailPage}
                      </span>{" "}
                      页
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={detailResults.length < PAGE_SIZE}
                      onClick={() => setDetailPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

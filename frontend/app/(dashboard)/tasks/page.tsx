"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
  Plus,
  Loader2,
  Search,
  ArrowUpDown,
  X,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Check,
  Pause,
  Play,
  Ban,
  ExternalLink,
  Trash2,
  Code2,
} from "lucide-react";
import {
  useTasks,
  useCreateTask,
  usePauseTask,
  useResumeTask,
  useCancelTask,
  useDeleteTask,
} from "@/lib/hooks/use-tasks";
import { useModels } from "@/lib/hooks/use-models";
import { useDatasets } from "@/lib/hooks/use-datasets";
import { useCriteria } from "@/lib/hooks/use-criteria";
import type { EvalTask } from "@/lib/types";
import { utc } from "@/lib/utils";

const statusLabel: Record<string, string> = {
  completed: "已完成",
  running: "运行中",
  failed: "失败",
  pending: "等待中",
  paused: "已暂停",
};

const statusBadgeVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  completed: "default",
  running: "secondary",
  failed: "destructive",
  pending: "outline",
  paused: "outline",
};

type PanelMode = { kind: "view"; id: string } | { kind: "create" } | null;

const STEPS = [
  { title: "选择模型" },
  { title: "数据集与评测标准" },
  { title: "参数配置" },
  { title: "确认提交" },
];

const emptyForm = {
  name: "",
  model_id: "",
  dataset_ids: [] as string[],
  criteria_ids: [] as string[],
  temperature: "0.7",
  max_tokens: "2048",
  limit: "",
  repeat_count: "1",
  seed_strategy: "fixed",
};

function formatDuration(start: string | null, end: string | null): string {
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

export default function TasksPage() {
  const router = useRouter();
  const { data: tasks = [], isLoading } = useTasks();
  const createTask = useCreateTask();
  const pauseTask = usePauseTask();
  const resumeTask = useResumeTask();
  const cancelTask = useCancelTask();
  const deleteTask = useDeleteTask();

  const { data: models = [] } = useModels();
  const { data: datasetsData } = useDatasets();
  const datasets = useMemo(() => datasetsData?.items ?? [], [datasetsData]);
  const { data: criteria = [] } = useCriteria();

  const [panel, setPanel] = useState<PanelMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ ...emptyForm });
  const [showConfigPreview, setShowConfigPreview] = useState(false);

  const selectedId = panel?.kind === "view" ? panel.id : null;
  const isCreating = panel?.kind === "create";
  const selectedTask = tasks.find((t) => t.id === selectedId);
  const panelOpen = !!panel;

  const openCreate = () => {
    setForm({ ...emptyForm, dataset_ids: [], criteria_ids: [] });
    setStep(0);
    setShowConfigPreview(false);
    setPanel({ kind: "create" });
  };

  const openView = (id: string) => {
    setPanel(
      panel?.kind === "view" && panel.id === id ? null : { kind: "view", id },
    );
  };

  const closePanel = () => setPanel(null);

  const handleSubmit = async () => {
    const paramsObj: Record<string, unknown> = {
      temperature: parseFloat(form.temperature),
      max_tokens: parseInt(form.max_tokens),
    };
    if (form.limit) paramsObj.limit = parseInt(form.limit);
    await createTask.mutateAsync({
      name: form.name,
      model_id: form.model_id,
      dataset_ids: form.dataset_ids,
      criteria_ids: form.criteria_ids,
      params_json: JSON.stringify(paramsObj),
      repeat_count: parseInt(form.repeat_count),
      seed_strategy: form.seed_strategy,
    });
    closePanel();
  };

  const filteredData = useMemo(
    () =>
      statusFilter === "__all__"
        ? tasks
        : tasks.filter((t) => t.status === statusFilter),
    [tasks, statusFilter],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      counts[t.status] = (counts[t.status] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  const columns = useMemo<ColumnDef<EvalTask>[]>(
    () => [
      {
        accessorKey: "name",
        header: "名称",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 min-w-0">
            {row.original.status === "failed" && (
              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
            )}
            <span className="font-medium truncate">{row.original.name}</span>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "状态",
        cell: ({ getValue }) => {
          const s = getValue<string>();
          return (
            <Badge
              variant={statusBadgeVariant[s] ?? "outline"}
              className="font-normal"
            >
              {statusLabel[s] ?? s}
            </Badge>
          );
        },
      },
      {
        accessorKey: "repeat_count",
        header: "重复",
        cell: ({ getValue }) => (
          <span className="text-xs font-mono text-muted-foreground">
            {getValue<number>()}
          </span>
        ),
      },
      {
        accessorKey: "seed_strategy",
        header: "种子策略",
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">
            {getValue<string>() === "fixed" ? "固定" : "随机"}
          </span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "创建时间",
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">
            {utc(getValue<string>())?.toLocaleString()}
          </span>
        ),
      },
      {
        id: "duration",
        header: "耗时",
        cell: ({ row }) => (
          <span className="text-xs font-mono text-muted-foreground">
            {formatDuration(row.original.started_at, row.original.finished_at)}
          </span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const canNext = () => {
    if (step === 0) return !!form.model_id;
    if (step === 1)
      return form.dataset_ids.length > 0 && form.criteria_ids.length > 0;
    if (step === 2) return !!form.name;
    return true;
  };

  const selectedModelName =
    models.find((m) => m.id === form.model_id)?.name ?? "";

  const parseParams = (json: string) => {
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <h1 className="text-lg font-semibold">评测任务</h1>
          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              共{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {tasks.length}
              </span>{" "}
              个任务
            </span>
            {Object.entries(statusCounts).map(([status, count]) => (
              <span key={status}>
                {statusLabel[status] ?? status}{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {count}
                </span>
              </span>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={openCreate} disabled={isCreating}>
          <Plus className="mr-1 h-4 w-4" /> 新建任务
        </Button>
      </div>

      {/* Toolbar: search + filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="搜索任务名称..."
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center h-9 border rounded-md overflow-hidden">
          {[
            { key: "__all__", label: "全部" },
            ...Object.entries(statusCounts)
              .filter(([, count]) => count > 0)
              .map(([status, count]) => ({
                key: status,
                label: `${statusLabel[status] ?? status} ${count}`,
              })),
          ].map((item, i, arr) => (
            <button
              key={item.key}
              onClick={() =>
                setStatusFilter(
                  item.key === "__all__"
                    ? "__all__"
                    : statusFilter === item.key
                      ? "__all__"
                      : item.key,
                )
              }
              className={`h-full px-3.5 text-xs font-medium transition-colors ${
                i < arr.length - 1 ? "border-r" : ""
              } ${
                statusFilter === item.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main: table + side panel */}
      <div className="flex gap-4 min-h-0">
        {/* Table */}
        <Card className={panelOpen ? "flex-1 min-w-0" : "w-full"}>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                加载中...
              </div>
            ) : table.getRowModel().rows.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                {tasks.length === 0 ? (
                  <div className="space-y-2">
                    <p>暂无评测任务</p>
                    <Button size="sm" variant="outline" onClick={openCreate}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> 创建第一个任务
                    </Button>
                  </div>
                ) : (
                  "无匹配结果。"
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id}>
                      {hg.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className="cursor-pointer select-none"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <span className="flex items-center gap-1">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {header.column.getCanSort() && (
                              <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
                            )}
                          </span>
                        </TableHead>
                      ))}
                      <TableHead className="w-8" />
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={`cursor-pointer transition-colors group/row ${
                        selectedId === row.original.id
                          ? "bg-accent"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => openView(row.original.id)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="py-2.5">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <div
                            className="opacity-0 group-hover/row:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              title="删除"
                              onClick={() =>
                                setDeleteTarget({
                                  id: row.original.id,
                                  name: row.original.name,
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <ChevronRight
                            className={`h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-hover/row:hidden ${
                              selectedId === row.original.id ? "rotate-90" : ""
                            }`}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Side panel: view OR create */}
        {panelOpen && (
          <div className="w-80 shrink-0">
            <Card className="sticky top-4">
              {/* Panel header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-1">
                <h3 className="text-sm font-semibold truncate">
                  {isCreating ? "新建任务" : selectedTask?.name ?? ""}
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 -mr-1"
                  onClick={closePanel}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Stepper indicator */}
              {isCreating && (
                <div className="px-5 pb-3 pt-2">
                  <div className="flex items-center">
                    {STEPS.map((s, i) => (
                      <div key={i} className="flex items-center flex-1 last:flex-none">
                        <button
                          type="button"
                          onClick={() => i < step && setStep(i)}
                          className={`relative flex items-center justify-center h-7 w-7 rounded-full text-xs font-medium shrink-0 transition-all ${
                            i < step
                              ? "bg-primary text-primary-foreground cursor-pointer"
                              : i === step
                                ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                                : "bg-muted text-muted-foreground"
                          }`}
                          title={s.title}
                        >
                          {i < step ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            i + 1
                          )}
                        </button>
                        {i < STEPS.length - 1 && (
                          <div
                            className={`flex-1 h-0.5 mx-1.5 rounded-full transition-colors ${
                              i < step ? "bg-primary" : "bg-border"
                            }`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    {STEPS[step].title}
                  </p>
                </div>
              )}

              {/* Create mode -- wizard */}
              {isCreating && (
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {/* Step 0: Select model */}
                    {step === 0 && (
                      <PanelField label="选择模型" required>
                        <Select
                          value={form.model_id}
                          onValueChange={(v) =>
                            setForm({ ...form, model_id: v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择一个模型" />
                          </SelectTrigger>
                          <SelectContent>
                            {models.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {models.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            暂无已注册模型，请先在模型页面添加。
                          </p>
                        )}
                      </PanelField>
                    )}

                    {/* Step 1: Select datasets + criteria */}
                    {step === 1 && (
                      <>
                        <PanelField label="选择数据集" required>
                          <div className="flex flex-wrap gap-1.5">
                            {datasets.map((d) => (
                              <button
                                key={d.id}
                                type="button"
                                onClick={() => {
                                  const ids = form.dataset_ids.includes(d.id)
                                    ? form.dataset_ids.filter(
                                        (id) => id !== d.id,
                                      )
                                    : [...form.dataset_ids, d.id];
                                  setForm({ ...form, dataset_ids: ids });
                                }}
                                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                                  form.dataset_ids.includes(d.id)
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "text-muted-foreground hover:bg-muted"
                                }`}
                              >
                                {d.name}
                              </button>
                            ))}
                            {datasets.length === 0 && (
                              <span className="text-xs text-muted-foreground">
                                暂无数据集
                              </span>
                            )}
                          </div>
                        </PanelField>
                        <PanelField label="选择评测标准" required>
                          <div className="flex flex-wrap gap-1.5">
                            {criteria.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  const ids = form.criteria_ids.includes(c.id)
                                    ? form.criteria_ids.filter(
                                        (id) => id !== c.id,
                                      )
                                    : [...form.criteria_ids, c.id];
                                  setForm({ ...form, criteria_ids: ids });
                                }}
                                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                                  form.criteria_ids.includes(c.id)
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "text-muted-foreground hover:bg-muted"
                                }`}
                              >
                                {c.name}
                              </button>
                            ))}
                            {criteria.length === 0 && (
                              <span className="text-xs text-muted-foreground">
                                暂无评测标准
                              </span>
                            )}
                          </div>
                        </PanelField>
                      </>
                    )}

                    {/* Step 2: Params */}
                    {step === 2 && (
                      <>
                        <PanelField label="任务名称" required>
                          <Input
                            value={form.name}
                            onChange={(e) =>
                              setForm({ ...form, name: e.target.value })
                            }
                            placeholder="评测任务名称"
                            required
                          />
                        </PanelField>
                        <div className="grid grid-cols-2 gap-2">
                          <PanelField label="温度">
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              max="2"
                              value={form.temperature}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  temperature: e.target.value,
                                })
                              }
                            />
                          </PanelField>
                          <PanelField label="最大 Token">
                            <Input
                              type="number"
                              value={form.max_tokens}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  max_tokens: e.target.value,
                                })
                              }
                            />
                          </PanelField>
                        </div>
                        <PanelField label="数据量限制">
                          <Input
                            type="number"
                            value={form.limit}
                            onChange={(e) =>
                              setForm({ ...form, limit: e.target.value })
                            }
                            placeholder="不限制"
                          />
                        </PanelField>
                        <div className="grid grid-cols-2 gap-2">
                          <PanelField label="重复次数">
                            <Input
                              type="number"
                              min="1"
                              value={form.repeat_count}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  repeat_count: e.target.value,
                                })
                              }
                            />
                          </PanelField>
                          <PanelField label="种子策略">
                            <Select
                              value={form.seed_strategy}
                              onValueChange={(v) =>
                                setForm({ ...form, seed_strategy: v })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="fixed">固定</SelectItem>
                                <SelectItem value="random">随机</SelectItem>
                              </SelectContent>
                            </Select>
                          </PanelField>
                        </div>
                      </>
                    )}

                    {/* Step 3: Review */}
                    {step === 3 && (
                      <>
                        <div className="space-y-2.5">
                          <DetailRow label="任务名称" value={form.name} />
                          <DetailRow label="模型" value={selectedModelName} />
                          <DetailRow
                            label="数据集"
                            value={
                              <div className="flex flex-wrap gap-1 justify-end">
                                {form.dataset_ids.map((id) => {
                                  const d = datasets.find(
                                    (ds) => ds.id === id,
                                  );
                                  return (
                                    <Badge
                                      key={id}
                                      variant="outline"
                                      className="text-[10px]"
                                    >
                                      {d?.name ?? id}
                                    </Badge>
                                  );
                                })}
                              </div>
                            }
                          />
                          <DetailRow
                            label="评测标准"
                            value={
                              <div className="flex flex-wrap gap-1 justify-end">
                                {form.criteria_ids.map((id) => {
                                  const c = criteria.find(
                                    (cr) => cr.id === id,
                                  );
                                  return (
                                    <Badge
                                      key={id}
                                      variant="outline"
                                      className="text-[10px]"
                                    >
                                      {c?.name ?? id}
                                    </Badge>
                                  );
                                })}
                              </div>
                            }
                          />
                          <DetailRow
                            label="温度"
                            value={form.temperature}
                          />
                          <DetailRow
                            label="最大 Token"
                            value={form.max_tokens}
                          />
                          {form.limit && (
                            <DetailRow label="数据量限制" value={form.limit} />
                          )}
                          <DetailRow
                            label="重复次数"
                            value={form.repeat_count}
                          />
                          <DetailRow
                            label="种子策略"
                            value={
                              form.seed_strategy === "fixed" ? "固定" : "随机"
                            }
                          />
                        </div>

                        {/* Config JSON preview toggle */}
                        <button
                          type="button"
                          onClick={() =>
                            setShowConfigPreview(!showConfigPreview)
                          }
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Code2 className="h-3 w-3" />
                          {showConfigPreview ? "隐藏" : "查看"} JSON 配置
                        </button>
                        {showConfigPreview && (
                          <pre className="text-[11px] bg-muted rounded-md p-3 overflow-auto max-h-40 font-mono">
                            {JSON.stringify(
                              {
                                name: form.name,
                                model_id: form.model_id,
                                dataset_ids: form.dataset_ids,
                                criteria_ids: form.criteria_ids,
                                params_json: {
                                  temperature: parseFloat(form.temperature),
                                  max_tokens: parseInt(form.max_tokens),
                                  ...(form.limit
                                    ? { limit: parseInt(form.limit) }
                                    : {}),
                                },
                                repeat_count: parseInt(form.repeat_count),
                                seed_strategy: form.seed_strategy,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        )}
                      </>
                    )}

                    {/* Navigation */}
                    <div className="flex gap-2 pt-1">
                      {step > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setStep(step - 1)}
                        >
                          <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                          上一步
                        </Button>
                      )}
                      {step < STEPS.length - 1 ? (
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1"
                          disabled={!canNext()}
                          onClick={() => setStep(step + 1)}
                        >
                          下一步
                          <ChevronRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1"
                          disabled={createTask.isPending}
                          onClick={handleSubmit}
                        >
                          {createTask.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="mr-2 h-4 w-4" />
                          )}
                          {createTask.isPending ? "提交中..." : "提交任务"}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              )}

              {/* View mode */}
              {selectedTask && !isCreating && (
                <CardContent className="pt-0 space-y-4">
                  <div className="space-y-2.5">
                    <DetailRow
                      label="状态"
                      value={
                        <Badge
                          variant={
                            statusBadgeVariant[selectedTask.status] ?? "outline"
                          }
                          className="text-xs font-normal"
                        >
                          {statusLabel[selectedTask.status] ??
                            selectedTask.status}
                        </Badge>
                      }
                    />
                    <DetailRow
                      label="模型"
                      value={selectedTask.model_name || selectedTask.model_id}
                    />
                    <DetailRow
                      label="数据集"
                      value={
                        <div className="flex flex-wrap gap-1 justify-end">
                          {selectedTask.dataset_ids
                            .split(",")
                            .filter(Boolean)
                            .map((id) => {
                              const d = datasets.find((ds) => ds.id === id.trim());
                              return (
                                <Badge key={id} variant="outline" className="text-[10px]">
                                  {d?.name ?? id.trim().slice(0, 8)}
                                </Badge>
                              );
                            })}
                        </div>
                      }
                    />
                    <DetailRow
                      label="评测标准"
                      value={
                        <div className="flex flex-wrap gap-1 justify-end">
                          {selectedTask.criteria_ids
                            .split(",")
                            .filter(Boolean)
                            .map((id) => {
                              const c = criteria.find((cr) => cr.id === id.trim());
                              return (
                                <Badge key={id} variant="outline" className="text-[10px]">
                                  {c?.name ?? id.trim().slice(0, 8)}
                                </Badge>
                              );
                            })}
                        </div>
                      }
                    />
                    <DetailRow
                      label="重复次数"
                      value={
                        <span className="font-mono">
                          {selectedTask.repeat_count}
                        </span>
                      }
                    />
                    <DetailRow
                      label="种子策略"
                      value={
                        selectedTask.seed_strategy === "fixed" ? "固定" : "随机"
                      }
                    />
                    {(() => {
                      const params = parseParams(selectedTask.params_json);
                      return (
                        <>
                          {params.temperature !== undefined && (
                            <DetailRow
                              label="温度"
                              value={
                                <span className="font-mono">
                                  {params.temperature}
                                </span>
                              }
                            />
                          )}
                          {params.max_tokens !== undefined && (
                            <DetailRow
                              label="最大 Token"
                              value={
                                <span className="font-mono">
                                  {params.max_tokens.toLocaleString()}
                                </span>
                              }
                            />
                          )}
                        </>
                      );
                    })()}
                    <DetailRow
                      label="创建时间"
                      value={utc(selectedTask.created_at)?.toLocaleString() ?? "\u2014"}
                    />
                    <DetailRow
                      label="开始时间"
                      value={utc(selectedTask.started_at)?.toLocaleString() ?? "\u2014"}
                    />
                    <DetailRow
                      label="结束时间"
                      value={utc(selectedTask.finished_at)?.toLocaleString() ?? "\u2014"}
                    />
                    <DetailRow
                      label="耗时"
                      value={
                        <span className="font-mono">
                          {formatDuration(
                            selectedTask.started_at,
                            selectedTask.finished_at,
                          )}
                        </span>
                      }
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-1">
                    {selectedTask.status === "running" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => pauseTask.mutate(selectedTask.id)}
                        disabled={pauseTask.isPending}
                      >
                        {pauseTask.isPending ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Pause className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        暂停
                      </Button>
                    )}
                    {(selectedTask.status === "paused" ||
                      selectedTask.status === "failed") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => resumeTask.mutate(selectedTask.id)}
                        disabled={resumeTask.isPending}
                      >
                        {resumeTask.isPending ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        恢复
                      </Button>
                    )}
                    {(selectedTask.status === "running" ||
                      selectedTask.status === "pending") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive hover:bg-destructive/5"
                        onClick={() => cancelTask.mutate(selectedTask.id)}
                        disabled={cancelTask.isPending}
                      >
                        {cancelTask.isPending ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Ban className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        取消
                      </Button>
                    )}
                  </div>

                  {/* View detail + delete */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => router.push(`/tasks/${selectedTask.id}`)}
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      查看详情
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive hover:bg-destructive/5"
                      onClick={() =>
                        setDeleteTarget({
                          id: selectedTask.id,
                          name: selectedTask.name,
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => { setDeleteTarget(null); setDeleteError(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除任务</DialogTitle>
            <DialogDescription>
              确定要删除 &quot;{deleteTarget?.name}&quot; 吗？相关的子任务和评测结果也将被删除，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive px-1">{deleteError}</p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteError(""); }}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setDeleteError("");
                try {
                  const id = deleteTarget!.id;
                  if (selectedId === id) closePanel();
                  await deleteTask.mutateAsync(id);
                  setDeleteTarget(null);
                } catch (err: unknown) {
                  const detail =
                    err && typeof err === "object" && "response" in err
                      ? (err as { response?: { data?: { detail?: string } } }).response
                          ?.data?.detail
                      : undefined;
                  setDeleteError(detail || "删除失败");
                }
              }}
              disabled={deleteTask.isPending}
            >
              {deleteTask.isPending ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -- Sub-components -- */

function PanelField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-muted-foreground shrink-0 pt-0.5">{label}</span>
      <div className="text-right min-w-0">{value}</div>
    </div>
  );
}

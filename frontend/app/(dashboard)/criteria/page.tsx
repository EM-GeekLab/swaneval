"use client";

import { useState, useMemo } from "react";
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
  Trash2,
  FlaskConical,
  Copy,
  Check,
  Loader2,
  Search,
  ArrowUpDown,
  X,
  ChevronRight,
} from "lucide-react";
import {
  useCriteria,
  useCreateCriterion,
  useDeleteCriterion,
  useTestCriterion,
} from "@/lib/hooks/use-criteria";
import type { Criterion } from "@/lib/types";
import { utc } from "@/lib/utils";

const typeLabel: Record<string, string> = {
  preset: "预设指标",
  regex: "正则",
  script: "脚本",
  llm_judge: "LLM 评判",
};

const typeDescriptions: Record<string, string> = {
  preset: "使用内置指标，如精确匹配、包含匹配或数值接近度。",
  regex: "使用正则表达式匹配模型输出。",
  script: "运行自定义脚本评估模型输出。",
  llm_judge: "使用另一个大语言模型评判响应质量。",
};

const presetMetrics = [
  { value: "exact_match", label: "精确匹配", desc: "输出必须与预期答案完全一致" },
  { value: "contains", label: "包含匹配", desc: "输出必须包含预期字符串" },
  { value: "numeric", label: "数值接近", desc: "在容差范围内比较数值" },
];

type PanelMode = { kind: "view"; id: string } | { kind: "create" } | null;

const emptyForm = {
  name: "",
  type: "preset",
  metric: "exact_match",
  pattern: "",
  script_path: "",
  entrypoint: "",
  judge_prompt: "",
};

function configSummary(configJson: string, type: string): string {
  try {
    const cfg = JSON.parse(configJson);
    if (type === "preset") return cfg.metric;
    if (type === "regex") return cfg.pattern;
    if (type === "script") return cfg.script_path;
    if (type === "llm_judge") return "LLM Judge";
    return configJson;
  } catch {
    return configJson;
  }
}

export default function CriteriaPage() {
  const { data: criteria = [], isLoading } = useCriteria();
  const create = useCreateCriterion();
  const deleteMut = useDeleteCriterion();
  const test = useTestCriterion();

  const [panel, setPanel] = useState<PanelMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  const [testId, setTestId] = useState("");
  const [testForm, setTestForm] = useState({
    prompt: "",
    expected: "",
    actual: "",
  });
  const [testResult, setTestResult] = useState<{ score: number } | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("__all__");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [form, setForm] = useState({ ...emptyForm });

  const selectedId = panel?.kind === "view" ? panel.id : null;
  const isCreating = panel?.kind === "create";
  const selectedCriterion = criteria.find((c) => c.id === selectedId);
  const panelOpen = !!panel;

  const openCreate = () => {
    setForm({ ...emptyForm });
    setPanel({ kind: "create" });
  };
  const openView = (id: string) => {
    setPanel(
      panel?.kind === "view" && panel.id === id
        ? null
        : { kind: "view", id },
    );
  };
  const closePanel = () => setPanel(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    let config: Record<string, unknown> = {};
    if (form.type === "preset") config = { metric: form.metric };
    else if (form.type === "regex")
      config = { pattern: form.pattern, match_mode: "contains" };
    else if (form.type === "script")
      config = { script_path: form.script_path, entrypoint: form.entrypoint };
    else if (form.type === "llm_judge")
      config = { system_prompt: form.judge_prompt };

    await create.mutateAsync({
      name: form.name,
      type: form.type,
      config_json: JSON.stringify(config),
    });
    closePanel();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError("");
    try {
      if (selectedId === deleteTarget.id) closePanel();
      await deleteMut.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response
              ?.data?.detail
          : undefined;
      setDeleteError(detail || "删除失败");
    }
  };

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await test.mutateAsync({
      criterion_id: testId,
      ...testForm,
    });
    setTestResult(result);
  };

  const filteredData = useMemo(
    () =>
      typeFilter === "__all__"
        ? criteria
        : criteria.filter((c) => c.type === typeFilter),
    [criteria, typeFilter],
  );

  const columns = useMemo<ColumnDef<Criterion>[]>(
    () => [
      {
        accessorKey: "name",
        header: "名称",
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "type",
        header: "类型",
        cell: ({ getValue }) => (
          <Badge variant="outline" className="font-normal">
            {typeLabel[getValue<string>()] ?? getValue<string>()}
          </Badge>
        ),
      },
      {
        id: "config",
        header: "配置",
        accessorFn: (row) => configSummary(row.config_json, row.type),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground truncate block max-w-[200px]">
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "创建时间",
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">
            {utc(getValue<string>())?.toLocaleDateString()}
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

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of criteria) {
      counts[c.type] = (counts[c.type] || 0) + 1;
    }
    return counts;
  }, [criteria]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <h1 className="text-lg font-semibold">评估标准</h1>
          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              共{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {criteria.length}
              </span>{" "}
              个标准
            </span>
            {Object.entries(typeCounts).map(([type, count]) => (
              <span key={type}>
                {typeLabel[type] ?? type}{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {count}
                </span>
              </span>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={openCreate} disabled={isCreating}>
          <Plus className="mr-1 h-4 w-4" /> 新建标准
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="搜索标准名称、配置..."
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center h-9 border rounded-md overflow-hidden">
          {[
            { key: "__all__", label: "全部" },
            ...Object.entries(typeCounts).map(([type, count]) => ({
              key: type,
              label: `${typeLabel[type] ?? type} ${count}`,
            })),
          ].map((item, i, arr) => (
            <button
              key={item.key}
              onClick={() =>
                setTypeFilter(
                  item.key === "__all__"
                    ? "__all__"
                    : typeFilter === item.key
                      ? "__all__"
                      : item.key,
                )
              }
              className={`h-full px-3.5 text-xs font-medium transition-colors ${
                i < arr.length - 1 ? "border-r" : ""
              } ${
                typeFilter === item.key
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
                {criteria.length === 0 ? (
                  <div className="space-y-2">
                    <p>暂无评估标准</p>
                    <Button size="sm" variant="outline" onClick={openCreate}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> 创建第一个标准
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
                          className={
                            header.column.getCanSort()
                              ? "cursor-pointer select-none"
                              : ""
                          }
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
                            className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="复制配置"
                              onClick={() => {
                                const c = row.original;
                                const config = {
                                  name: c.name,
                                  type: c.type,
                                  config_json: c.config_json,
                                };
                                navigator.clipboard.writeText(
                                  JSON.stringify(config, null, 2),
                                );
                                setCopiedRowId(c.id);
                                setTimeout(() => setCopiedRowId(null), 1500);
                              }}
                            >
                              {copiedRowId === row.original.id ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="测试"
                              onClick={() => {
                                setTestId(row.original.id);
                                setTestResult(null);
                                setTestForm({ prompt: "", expected: "", actual: "" });
                                setTestOpen(true);
                              }}
                            >
                              <FlaskConical className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
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
                            className={`h-3.5 w-3.5 text-muted-foreground/40 transition-transform ${
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

        {/* Side panel */}
        {panelOpen && (
          <div className="w-96 shrink-0">
            <Card className="sticky top-4">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h3 className="text-sm font-semibold truncate">
                  {isCreating
                    ? "新建评估标准"
                    : selectedCriterion?.name ?? ""}
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

              {/* Create mode */}
              {isCreating && (
                <CardContent className="pt-0">
                  <form onSubmit={handleCreate} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <PanelField label="名称" required>
                        <Input
                          value={form.name}
                          onChange={(e) =>
                            setForm({ ...form, name: e.target.value })
                          }
                          placeholder="精确匹配"
                          required
                        />
                      </PanelField>
                      <PanelField label="类型">
                        <Select
                          value={form.type}
                          onValueChange={(v) =>
                            setForm({ ...form, type: v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="preset">预设指标</SelectItem>
                            <SelectItem value="regex">正则表达式</SelectItem>
                            <SelectItem value="script">自定义脚本</SelectItem>
                            <SelectItem value="llm_judge">
                              LLM 评判
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </PanelField>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {typeDescriptions[form.type]}
                    </p>

                    {form.type === "preset" && (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          指标
                        </Label>
                        <div className="space-y-1.5">
                          {presetMetrics.map((m) => (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() =>
                                setForm({ ...form, metric: m.value })
                              }
                              className={`w-full rounded-md border p-2.5 text-left transition-colors ${
                                form.metric === m.value
                                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                                  : "hover:bg-muted"
                              }`}
                            >
                              <p className="text-sm font-medium">{m.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {m.desc}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {form.type === "regex" && (
                      <PanelField label="正则表达式" required>
                        <Input
                          value={form.pattern}
                          onChange={(e) =>
                            setForm({ ...form, pattern: e.target.value })
                          }
                          placeholder="\\d+\\.?\\d*"
                          className="font-mono"
                          required
                        />
                      </PanelField>
                    )}

                    {form.type === "script" && (
                      <>
                        <PanelField label="脚本路径" required>
                          <Input
                            value={form.script_path}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                script_path: e.target.value,
                              })
                            }
                            placeholder="/path/to/eval_script.py"
                            className="font-mono"
                            required
                          />
                        </PanelField>
                        <PanelField label="入口函数" required>
                          <Input
                            value={form.entrypoint}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                entrypoint: e.target.value,
                              })
                            }
                            placeholder="evaluate"
                            className="font-mono"
                            required
                          />
                        </PanelField>
                      </>
                    )}

                    {form.type === "llm_judge" && (
                      <PanelField label="系统提示词" required>
                        <textarea
                          value={form.judge_prompt}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              judge_prompt: e.target.value,
                            })
                          }
                          placeholder="你是一个评估专家。请根据以下标准对回答打分（0-1）..."
                          className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          required
                        />
                      </PanelField>
                    )}

                    <div className="pt-1">
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={create.isPending}
                      >
                        {create.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        {create.isPending ? "创建中..." : "创建标准"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              )}

              {/* View mode */}
              {selectedCriterion && !isCreating && (
                <CardContent className="pt-0 space-y-4">
                  <div className="space-y-2.5">
                    <DetailRow
                      label="类型"
                      value={
                        <Badge
                          variant="outline"
                          className="text-xs font-normal"
                        >
                          {typeLabel[selectedCriterion.type] ??
                            selectedCriterion.type}
                        </Badge>
                      }
                    />
                    <DetailRow
                      label="配置"
                      value={
                        <code className="font-mono text-xs">
                          {configSummary(
                            selectedCriterion.config_json,
                            selectedCriterion.type,
                          )}
                        </code>
                      }
                    />
                    <DetailRow
                      label="创建时间"
                      value={
                        utc(selectedCriterion.created_at)?.toLocaleString() ??
                        "\u2014"
                      }
                    />
                  </div>

                  {/* Raw config */}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      配置 JSON
                    </p>
                    <pre className="rounded-md bg-muted p-2.5 text-xs font-mono overflow-auto max-h-32">
                      {(() => {
                        try {
                          return JSON.stringify(
                            JSON.parse(selectedCriterion.config_json),
                            null,
                            2,
                          );
                        } catch {
                          return selectedCriterion.config_json;
                        }
                      })()}
                    </pre>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setTestId(selectedCriterion.id);
                        setTestResult(null);
                        setTestForm({
                          prompt: "",
                          expected: "",
                          actual: "",
                        });
                        setTestOpen(true);
                      }}
                    >
                      <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
                      测试
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive hover:bg-destructive/5"
                      onClick={() =>
                        setDeleteTarget({
                          id: selectedCriterion.id,
                          name: selectedCriterion.name,
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
      <Dialog
        open={!!deleteTarget}
        onOpenChange={() => {
          setDeleteTarget(null);
          setDeleteError("");
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除评估标准</DialogTitle>
            <DialogDescription>
              确定要删除 &quot;{deleteTarget?.name}&quot; 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive px-1">{deleteError}</p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError("");
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>测试评估标准</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleTest} className="space-y-3">
            <div className="space-y-1">
              <Label>输入提示</Label>
              <Input
                value={testForm.prompt}
                onChange={(e) =>
                  setTestForm({ ...testForm, prompt: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>预期输出</Label>
              <Input
                value={testForm.expected}
                onChange={(e) =>
                  setTestForm({ ...testForm, expected: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-1">
              <Label>实际输出</Label>
              <Input
                value={testForm.actual}
                onChange={(e) =>
                  setTestForm({ ...testForm, actual: e.target.value })
                }
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={test.isPending}
            >
              {test.isPending ? "测试中..." : "运行测试"}
            </Button>
            {testResult !== null && (
              <div className="rounded bg-muted p-3 text-center">
                <span className="text-xs text-muted-foreground">得分：</span>
                <span
                  className={`text-lg font-bold ${
                    testResult.score >= 1
                      ? "text-emerald-600"
                      : "text-destructive"
                  }`}
                >
                  {testResult.score}
                </span>
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Sub-components ── */

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

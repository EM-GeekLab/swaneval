"use client";

import { useState, useMemo, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PanelField, DetailRow } from "@/components/panel-helpers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Ruler,
} from "lucide-react";
import { TableEmpty, TableLoading } from "@/components/table-states";
import {
  useCriteria,
  useCriteriaPresets,
  useCreateCriterion,
  useDeleteCriterion,
  useTestCriterion,
} from "@/lib/hooks/use-criteria";
import { useModels } from "@/lib/hooks/use-models";
import type { Criterion } from "@/lib/types";
import { utc } from "@/lib/utils";
import { FilterDropdown } from "@/components/filter-dropdown";
import { CreateModal } from "@/components/create-modal";
import { SelectionBar } from "@/components/selection-bar";
import { DeleteDialog } from "@/components/delete-dialog";
import { TablePagination } from "@/components/table-pagination";
import { PresetListPanel, type PresetItem } from "@/components/preset-list-panel";

const typeLabel: Record<string, string> = {
  preset: "预设指标",
  regex: "正则",
  script: "脚本",
  llm_judge: "LLM 评判",
};

const typeDescriptions: Record<string, string> = {
  preset: "使用内置指标，如精确匹配、包含匹配或数值接近度。",
  regex: "使用正则表达式匹配模型输出。",
  script: "运行服务器上的 Python 脚本评估模型输出。脚本需包含一个评估函数，接收 expected 和 actual 参数，返回 0-1 之间的浮点数。",
  llm_judge: "使用另一个大语言模型评判响应质量。",
};

const presetMetrics = [
  {
    value: "exact_match",
    label: "精确匹配",
    desc: "输出必须与预期答案完全一致",
  },
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
  script_args: "",
  judge_prompt: "",
  judge_model_id: "",
};

function configSummary(configJson: string, type: string): string {
  try {
    const cfg = JSON.parse(configJson);
    if (type === "preset") return cfg.metric;
    if (type === "regex") return cfg.pattern;
    if (type === "script") return cfg.script_path;
    if (type === "llm_judge") return cfg.system_prompt ? "自定义评判" : "LLM Judge";
    return configJson;
  } catch {
    return configJson;
  }
}

export default function CriteriaPage() {
  const { data: criteria = [], isLoading } = useCriteria();
  const { data: models = [] } = useModels();
  const { data: presetCriteria = [] } = useCriteriaPresets();
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
  const [testError, setTestError] = useState("");
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("__all__");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [form, setForm] = useState({ ...emptyForm });
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [createPos, setCreatePos] = useState<{ top: number; right: number } | null>(null);

  const selectedId = panel?.kind === "view" ? panel.id : null;
  const isCreating = panel?.kind === "create";
  const selectedCriterion = criteria.find((c) => c.id === selectedId);
  const viewPanelOpen = panel?.kind === "view";
  const [shakeCancel, setShakeCancel] = useState(false);
  const [presetSelected, setPresetSelected] = useState<string[]>([]);
  const [presetError, setPresetError] = useState("");

  const formDirty = isCreating && Object.entries(emptyForm).some(
    ([k, v]) => form[k as keyof typeof form] !== v,
  );

  const openCreate = () => {
    setForm({ ...emptyForm });
    if (addBtnRef.current) {
      const rect = addBtnRef.current.getBoundingClientRect();
      setCreatePos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setPanel({ kind: "create" });
  };
  const openView = (id: string) => {
    setPanel(
      panel?.kind === "view" && panel.id === id ? null : { kind: "view", id },
    );
  };
  const closePanel = () => setPanel(null);
  const [importError, setImportError] = useState("");

  const importCriterionJson = (text: string) => {
    setImportError("");
    try {
      const data = JSON.parse(text);
      const cfg = data.config_json
        ? typeof data.config_json === "string"
          ? JSON.parse(data.config_json)
          : data.config_json
        : {};
      setForm((f) => ({
        ...f,
        name: data.name ?? f.name,
        type: data.type ?? f.type,
        metric: cfg.metric ?? f.metric,
        pattern: cfg.pattern ?? f.pattern,
        script_path: cfg.script_path ?? f.script_path,
        script_args: f.script_args,
        entrypoint: cfg.entrypoint ?? f.entrypoint,
        judge_prompt: cfg.system_prompt ?? f.judge_prompt,
        judge_model_id: cfg.judge_model_id ?? f.judge_model_id,
      }));
    } catch {
      setImportError("无法解析 JSON");
      setTimeout(() => setImportError(""), 3000);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    let config: Record<string, unknown> = {};
    if (form.type === "preset") config = { metric: form.metric };
    else if (form.type === "regex")
      config = { pattern: form.pattern, match_mode: "contains" };
    else if (form.type === "script") {
      config = {
        script_path: form.script_path,
        entrypoint: form.entrypoint,
      };
      if (form.script_args.trim()) {
        try {
          config = { ...config, ...JSON.parse(form.script_args) };
        } catch { /* ignore invalid JSON in extra args */ }
      }
    }
    else if (form.type === "llm_judge")
      config = {
        system_prompt: form.judge_prompt,
        ...(form.judge_model_id ? { judge_model_id: form.judge_model_id } : {}),
      };

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
    setTestError("");
    setTestResult(null);
    try {
      const result = await test.mutateAsync({
        criterion_id: testId,
        ...testForm,
      });
      setTestResult(result);
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response
              ?.data?.detail
          : undefined;
      setTestError(detail || "测试失败，请检查评估标准配置。");
    }
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
        id: "select",
        size: 32,
        enableSorting: false,
        enableResizing: false,
        header: ({ table }) => (
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-input accent-primary"
            checked={table.getIsAllPageRowsSelected()}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-input accent-primary"
            checked={row.getIsSelected()}
            onChange={(e) => {
              e.stopPropagation();
              row.toggleSelected(e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
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
    state: { sorting, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
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
        <Button
          ref={addBtnRef}
          size="sm"
          onClick={isCreating ? closePanel : openCreate}
          variant={isCreating ? "destructive" : "default"}
          className={`${isCreating ? "relative z-[60]" : ""} ${shakeCancel ? "animate-shake" : ""}`}
          onAnimationEnd={() => setShakeCancel(false)}
        >
          {isCreating ? (
            <><X className="mr-1 h-4 w-4" /> 取消</>
          ) : (
            <><Plus className="mr-1 h-4 w-4" /> 新建标准</>
          )}
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
            className="pl-9 h-8 rounded-full text-xs"
          />
        </div>
        <FilterDropdown
          label="类型"
          options={Object.entries(typeCounts).map(([type, count]) => ({
            key: type,
            label: typeLabel[type] ?? type,
            count,
          }))}
          value={typeFilter}
          onChange={setTypeFilter}
        />
      </div>

      {/* Main: table + side panel */}
      <div className="flex gap-4 min-h-0">
        {/* Table */}
        <Card className={viewPanelOpen ? "flex-1 min-w-0" : "w-full"}>
          <CardContent className="p-0">
            {isLoading ? (
              <TableLoading />
            ) : table.getRowModel().rows.length === 0 ? (
              criteria.length === 0 ? (
                <TableEmpty
                  icon={Ruler}
                  title="暂无评估标准"
                  description="创建预设指标、正则、脚本或 LLM 评判标准"
                  action={
                    <Button size="sm" variant="outline" onClick={openCreate}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> 创建第一个标准
                    </Button>
                  }
                />
              ) : (
                <TableEmpty title="无匹配结果" />
              )
            ) : (
              <>
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id}>
                      {hg.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          style={header.column.id === "select" ? { width: 40 } : undefined}
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
                        <TableCell key={cell.id} className="py-2.5" style={cell.column.id === "select" ? { width: 40 } : undefined}>
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
                                setTestForm({
                                  prompt: "",
                                  expected: "",
                                  actual: "",
                                });
                                setTestError("");
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
              <TablePagination table={table} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Side panel — view only */}
        {viewPanelOpen && selectedCriterion && (
          <div className="w-1/3 shrink-0">
            <Card className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-auto">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h3 className="text-sm font-semibold truncate">
                  {selectedCriterion.name}
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
                  {(() => {
                    try {
                      const cfg = JSON.parse(selectedCriterion.config_json);
                      if (selectedCriterion.type === "preset")
                        return (
                          <DetailRow
                            label="指标"
                            value={<code className="font-mono text-xs">{cfg.metric}</code>}
                          />
                        );
                      if (selectedCriterion.type === "regex")
                        return (
                          <DetailRow
                            label="正则"
                            value={<code className="font-mono text-xs">{cfg.pattern}</code>}
                          />
                        );
                      if (selectedCriterion.type === "script")
                        return (
                          <>
                            <DetailRow
                              label="脚本"
                              value={<code className="font-mono text-xs truncate block max-w-[180px]">{cfg.script_path}</code>}
                            />
                            {cfg.entrypoint && (
                              <DetailRow
                                label="入口"
                                value={<code className="font-mono text-xs">{cfg.entrypoint}</code>}
                              />
                            )}
                          </>
                        );
                      if (selectedCriterion.type === "llm_judge") {
                        const judgeModel = models.find((m) => m.id === cfg.judge_model_id);
                        return (
                          <>
                            {judgeModel && (
                              <DetailRow label="评判模型" value={judgeModel.name} />
                            )}
                            {cfg.system_prompt && (
                              <DetailRow
                                label="提示词"
                                value={
                                  <span className="text-xs truncate block max-w-[180px]">
                                    {cfg.system_prompt.slice(0, 60)}
                                    {cfg.system_prompt.length > 60 ? "..." : ""}
                                  </span>
                                }
                              />
                            )}
                          </>
                        );
                      }
                      return (
                        <DetailRow
                          label="配置"
                          value={<code className="font-mono text-xs">{configSummary(selectedCriterion.config_json, selectedCriterion.type)}</code>}
                        />
                      );
                    } catch {
                      return (
                        <DetailRow
                          label="配置"
                          value={<code className="font-mono text-xs">{selectedCriterion.config_json}</code>}
                        />
                      );
                    }
                  })()}
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
                  <p className="text-xs text-muted-foreground">配置 JSON</p>
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
            </Card>
          </div>
        )}
      </div>

      {/* Create modal */}
      <CreateModal
        open={isCreating}
        position={createPos}
        formDirty={formDirty}
        onClose={closePanel}
        onShake={() => setShakeCancel(true)}
        title="新建评估标准"
        sidePanel={
          <PresetListPanel
            title="预设评估标准"
            multi
            items={presetCriteria.map((p): PresetItem => ({
              key: p.name,
              name: p.name,
              description: p.description,
              badge: typeLabel[p.type] ?? p.type,
              done: criteria.some((c) => c.name === p.name),
            }))}
            selected={presetSelected}
            onSelectionChange={setPresetSelected}
            onConfirm={async (keys) => {
              setPresetError("");
              for (const key of keys) {
                const p = presetCriteria.find((x) => x.name === key);
                if (!p) continue;
                try {
                  await create.mutateAsync({
                    name: p.name,
                    type: p.type,
                    config_json: p.config_json,
                  });
                } catch {
                  setPresetError("添加失败");
                  return;
                }
              }
              setPresetSelected([]);
            }}
            confirmLabel="添加"
            confirming={create.isPending}
            error={presetError}
          />
        }
      >
                <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
                  <button
                    type="button"
                    className="hover:text-foreground transition-colors"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        importCriterionJson(text);
                      } catch {
                        setImportError("无法读取剪贴板");
                        setTimeout(() => setImportError(""), 3000);
                      }
                    }}
                  >
                    从剪贴板导入
                  </button>
                  <span className="text-border">|</span>
                  <label className="hover:text-foreground transition-colors cursor-pointer">
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () =>
                          importCriterionJson(reader.result as string);
                        reader.readAsText(file);
                        e.target.value = "";
                      }}
                    />
                    从 JSON 导入
                  </label>
                  {importError && (
                    <span className="text-destructive">{importError}</span>
                  )}
                </div>

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
                        onValueChange={(v) => setForm({ ...form, type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="preset">预设指标</SelectItem>
                          <SelectItem value="regex">正则表达式</SelectItem>
                          <SelectItem value="script">自定义脚本</SelectItem>
                          <SelectItem value="llm_judge">LLM 评判</SelectItem>
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
                      <RegexInput
                        value={form.pattern}
                        onChange={(v) =>
                          setForm({ ...form, pattern: v })
                        }
                        placeholder="\\d+\\.?\\d*"
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
                      <PanelField label="入口函数">
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
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          默认为 evaluate。留空使用默认值。
                        </p>
                      </PanelField>
                      <PanelField label="额外参数 (JSON)">
                        <Input
                          value={form.script_args}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              script_args: e.target.value,
                            })
                          }
                          placeholder='{"threshold": 0.8}'
                          className="font-mono"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          可选。将作为 config 参数传入脚本函数。
                        </p>
                      </PanelField>
                      <div className="rounded-md bg-muted p-2.5 text-[11px] font-mono text-muted-foreground space-y-0.5">
                        <p className="text-foreground/70 font-sans text-xs font-medium mb-1">
                          脚本函数签名示例
                        </p>
                        <p>def evaluate(expected, actual, config=None):</p>
                        <p>    # 返回 0.0 - 1.0 之间的浮点数</p>
                        <p>    return 1.0 if expected in actual else 0.0</p>
                      </div>
                    </>
                  )}

                  {form.type === "llm_judge" && (
                    <>
                      <PanelField label="评判模型" required>
                        <Select
                          value={form.judge_model_id}
                          onValueChange={(v) =>
                            setForm({ ...form, judge_model_id: v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择用于评判的模型" />
                          </SelectTrigger>
                          <SelectContent>
                            {models.length === 0 ? (
                              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                                暂无模型，<a href="/models" className="text-primary hover:underline">去添加</a>
                              </div>
                            ) : models.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                                {m.model_name && (
                                  <span className="text-muted-foreground ml-1">
                                    ({m.model_name})
                                  </span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {models.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            请先在模型页面添加一个模型。
                          </p>
                        )}
                      </PanelField>
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
                    </>
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
      </CreateModal>

      {/* Floating selection bar */}
      <SelectionBar
        count={Object.keys(rowSelection).length}
        onDelete={async () => {
          const ids = Object.keys(rowSelection).map(
            (idx) => filteredData[parseInt(idx)]?.id,
          ).filter(Boolean);
          for (const id of ids) {
            try { await deleteMut.mutateAsync(id); } catch { /* skip */ }
          }
          setRowSelection({});
        }}
        onClear={() => setRowSelection({})}
      />

      {/* Delete confirmation */}
      <DeleteDialog
        open={!!deleteTarget}
        title="删除评估标准"
        name={deleteTarget?.name ?? ""}
        error={deleteError}
        isPending={deleteMut.isPending}
        onConfirm={handleDelete}
        onCancel={() => { setDeleteTarget(null); setDeleteError(""); }}
      />

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
            <Button type="submit" className="w-full" disabled={test.isPending}>
              {test.isPending ? "测试中..." : "运行测试"}
            </Button>
            {testError && (
              <div className="rounded bg-destructive/10 p-3 text-xs text-destructive">
                {testError}
              </div>
            )}
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

/* Tokenize a regex string into colored spans */
function highlightRegex(pattern: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];

    // Escape sequences: \d, \w, \s, \., etc.
    if (ch === "\\" && i + 1 < pattern.length) {
      const esc = pattern[i + 1];
      const isShorthand = "dwsDbBWS".includes(esc);
      tokens.push(
        <span key={i} className={isShorthand ? "text-amber-500" : "text-sky-500"}>
          {ch}{esc}
        </span>,
      );
      i += 2;
      continue;
    }

    // Character classes: [...]
    if (ch === "[") {
      let end = i + 1;
      if (end < pattern.length && pattern[end] === "^") end++;
      if (end < pattern.length && pattern[end] === "]") end++;
      while (end < pattern.length && pattern[end] !== "]") end++;
      const cls = pattern.slice(i, end + 1);
      tokens.push(
        <span key={i} className="text-emerald-500">{cls}</span>,
      );
      i = end + 1;
      continue;
    }

    // Groups: ( and )
    if (ch === "(" || ch === ")") {
      tokens.push(
        <span key={i} className="text-violet-500 font-semibold">{ch}</span>,
      );
      i++;
      continue;
    }

    // Quantifiers: * + ? {n,m}
    if ("*+?".includes(ch)) {
      tokens.push(
        <span key={i} className="text-rose-500">{ch}</span>,
      );
      i++;
      continue;
    }
    if (ch === "{") {
      let end = i + 1;
      while (end < pattern.length && pattern[end] !== "}") end++;
      tokens.push(
        <span key={i} className="text-rose-500">{pattern.slice(i, end + 1)}</span>,
      );
      i = end + 1;
      continue;
    }

    // Anchors and alternation: ^ $ |
    if ("^$|".includes(ch)) {
      tokens.push(
        <span key={i} className="text-primary font-semibold">{ch}</span>,
      );
      i++;
      continue;
    }

    // Dot (any char)
    if (ch === ".") {
      tokens.push(
        <span key={i} className="text-amber-500">{ch}</span>,
      );
      i++;
      continue;
    }

    // Literal characters
    tokens.push(<span key={i}>{ch}</span>);
    i++;
  }
  return tokens;
}

function RegexInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [valid, setValid] = useState(true);

  const validate = (v: string) => {
    try {
      if (v) new RegExp(v);
      setValid(true);
    } catch {
      setValid(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="relative">
        {/* Highlight layer */}
        <div
          className="absolute inset-0 flex items-center px-3 py-2 font-mono text-sm pointer-events-none overflow-hidden whitespace-pre"
          aria-hidden
        >
          {value ? highlightRegex(value) : (
            <span className="text-muted-foreground">{!focused ? placeholder : ""}</span>
          )}
        </div>
        {/* Actual input — transparent text, visible caret */}
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            validate(e.target.value);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder=""
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-transparent caret-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
      {!valid && value && (
        <p className="text-[11px] text-destructive">正则表达式语法错误</p>
      )}
    </div>
  );
}

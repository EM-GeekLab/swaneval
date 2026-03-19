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
  type RowSelectionState,
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
  Zap,
  Loader2,
  Search,
  ArrowUpDown,
  X,
  ChevronRight,
  Pencil,
  Copy,
  Check,
} from "lucide-react";
import {
  useModels,
  useCreateModel,
  useUpdateModel,
  useDeleteModel,
  useTestModel,
} from "@/lib/hooks/use-models";
import type { LLMModel } from "@/lib/types";
import { utc } from "@/lib/utils";

const typeLabel: Record<string, string> = {
  api: "API",
  local: "本地",
  huggingface: "HuggingFace",
};

type PanelMode = { kind: "view"; id: string } | { kind: "create" } | null;

const apiFormatLabel: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

const emptyForm = {
  name: "",
  provider: "",
  endpoint_url: "",
  api_key: "",
  model_type: "api",
  api_format: "openai",
  description: "",
  model_name: "",
  max_tokens: "4096",
};

export default function ModelsPage() {
  const { data: models = [], isLoading } = useModels();
  const create = useCreateModel();
  const update = useUpdateModel();
  const deleteMut = useDeleteModel();
  const testModel = useTestModel();

  const [panel, setPanel] = useState<PanelMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("__all__");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [form, setForm] = useState({ ...emptyForm });

  const selectedId = panel?.kind === "view" ? panel.id : null;
  const isCreating = panel?.kind === "create";
  const selectedModel = models.find((m) => m.id === selectedId);
  const panelOpen = !!panel;

  const openCreate = () => {
    setForm({ ...emptyForm });
    setPanel({ kind: "create" });
  };

  const openView = (id: string) => {
    setPanel(
      panel?.kind === "view" && panel.id === id ? null : { kind: "view", id },
    );
  };

  const closePanel = () => setPanel(null);

  const [importError, setImportError] = useState("");

  const importFromClipboard = async () => {
    setImportError("");
    try {
      const text = await navigator.clipboard.readText();
      const data = JSON.parse(text);
      setForm((f) => ({
        ...f,
        name: data.name ?? f.name,
        provider: data.provider ?? f.provider,
        endpoint_url: data.endpoint_url ?? f.endpoint_url,
        api_key: data.api_key ?? f.api_key,
        model_type: data.model_type ?? f.model_type,
        api_format: data.api_format ?? f.api_format,
        description: data.description ?? f.description,
        model_name: data.model_name ?? f.model_name,
        max_tokens:
          data.max_tokens != null ? String(data.max_tokens) : f.max_tokens,
      }));
    } catch {
      setImportError("剪贴板内容不是有效的 JSON");
      setTimeout(() => setImportError(""), 3000);
    }
  };

  const importFromJson = (text: string) => {
    setImportError("");
    try {
      const data = JSON.parse(text);
      setForm((f) => ({
        ...f,
        name: data.name ?? f.name,
        provider: data.provider ?? f.provider,
        endpoint_url: data.endpoint_url ?? f.endpoint_url,
        api_key: data.api_key ?? f.api_key,
        model_type: data.model_type ?? f.model_type,
        api_format: data.api_format ?? f.api_format,
        description: data.description ?? f.description,
        model_name: data.model_name ?? f.model_name,
        max_tokens:
          data.max_tokens != null ? String(data.max_tokens) : f.max_tokens,
      }));
    } catch {
      setImportError("无法解析 JSON");
      setTimeout(() => setImportError(""), 3000);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const isHF = form.model_type === "huggingface";
    await create.mutateAsync({
      name: form.name,
      provider: isHF ? "huggingface" : form.provider,
      endpoint_url: isHF
        ? `https://api-inference.huggingface.co/models/${form.model_name}/v1/chat/completions`
        : form.endpoint_url,
      api_key: form.api_key || undefined,
      model_type: form.model_type,
      api_format: isHF ? "openai" : form.api_format,
      description: form.description || undefined,
      model_name: form.model_name || undefined,
      max_tokens: form.max_tokens ? parseInt(form.max_tokens) : undefined,
    });
    closePanel();
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResults((prev) => ({
      ...prev,
      [id]: { ok: false, message: "测试中..." },
    }));
    try {
      const result = await testModel.mutateAsync(id);
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: result.ok, message: result.message },
      }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, message: "连接失败" },
      }));
    } finally {
      setTestingId(null);
    }
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

  const filteredData = useMemo(
    () =>
      typeFilter === "__all__"
        ? models
        : models.filter((m) => m.model_type === typeFilter),
    [models, typeFilter],
  );

  const columns = useMemo<ColumnDef<LLMModel>[]>(
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
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium truncate">{row.original.name}</p>
            {row.original.model_name && (
              <p className="text-xs text-muted-foreground font-mono truncate">
                {row.original.model_name}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "provider",
        header: "提供商",
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "model_type",
        header: "类型",
        cell: ({ getValue }) => (
          <Badge variant="outline" className="font-normal">
            {typeLabel[getValue<string>()] ?? getValue<string>()}
          </Badge>
        ),
      },
      {
        accessorKey: "endpoint_url",
        header: "端点",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground truncate block max-w-[220px]">
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: "status",
        header: "连接",
        cell: ({ row }) => {
          const r = testResults[row.original.id];
          if (!r)
            return <span className="text-xs text-muted-foreground">—</span>;
          if (r.message === "测试中...")
            return (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            );
          return (
            <span
              className={`inline-block h-2 w-2 rounded-full ${r.ok ? "bg-emerald-500" : "bg-destructive"}`}
              title={r.message}
            />
          );
        },
      },
      {
        accessorKey: "max_tokens",
        header: "Token",
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          return (
            <span className="text-xs font-mono text-muted-foreground">
              {v ? v.toLocaleString() : "—"}
            </span>
          );
        },
      },
    ],
    [testResults],
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
  });

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of models) {
      counts[m.model_type] = (counts[m.model_type] || 0) + 1;
    }
    return counts;
  }, [models]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <h1 className="text-lg font-semibold">模型管理</h1>
          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              共{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {models.length}
              </span>{" "}
              个模型
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
          <Plus className="mr-1 h-4 w-4" /> 添加模型
        </Button>
      </div>

      {/* Toolbar: search + filter — unified h-9 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="搜索模型名称、提供商、端点..."
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
        {Object.keys(rowSelection).length > 0 && (
          <div className="flex items-center gap-2 ml-auto text-xs text-muted-foreground">
            <span>
              已选择{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {Object.keys(rowSelection).length}
              </span>{" "}
              项
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={async () => {
                const ids = Object.keys(rowSelection).map(
                  (idx) => filteredData[parseInt(idx)]?.id,
                ).filter(Boolean);
                for (const id of ids) {
                  try { await deleteMut.mutateAsync(id); } catch { /* skip failed */ }
                }
                setRowSelection({});
              }}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              删除
            </Button>
            <button
              className="text-xs hover:text-foreground transition-colors"
              onClick={() => setRowSelection({})}
            >
              取消
            </button>
          </div>
        )}
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
                {models.length === 0 ? (
                  <div className="space-y-2">
                    <p>暂无已注册的模型</p>
                    <Button size="sm" variant="outline" onClick={openCreate}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> 添加第一个模型
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
                          style={header.column.id === "select" ? { width: 40 } : undefined}
                          className={header.column.getCanSort() ? "cursor-pointer select-none" : ""}
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
                                const m = row.original;
                                const config = {
                                  name: m.name,
                                  provider: m.provider,
                                  model_type: m.model_type,
                                  api_format: m.api_format,
                                  model_name: m.model_name,
                                  endpoint_url: m.endpoint_url,
                                  max_tokens: m.max_tokens,
                                };
                                navigator.clipboard.writeText(
                                  JSON.stringify(config, null, 2),
                                );
                                setCopiedId(m.id);
                                setTimeout(() => setCopiedId(null), 1500);
                              }}
                            >
                              {copiedId === row.original.id ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="测试连接"
                              onClick={() => handleTest(row.original.id)}
                              disabled={testingId === row.original.id}
                            >
                              {testingId === row.original.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Zap className="h-3.5 w-3.5" />
                              )}
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

        {/* Side panel: view OR create — same surface */}
        {panelOpen && (
          <div className="w-80 shrink-0">
            <Card className="sticky top-4">
              {/* Panel header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h3 className="text-sm font-semibold truncate">
                  {isCreating ? "添加模型" : (selectedModel?.name ?? "")}
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
                  <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
                    <button
                      type="button"
                      className="hover:text-foreground transition-colors"
                      onClick={importFromClipboard}
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
                            importFromJson(reader.result as string);
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
                    <PanelField label="显示名称" required>
                      <Input
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                        placeholder="GPT-4o"
                        required
                      />
                    </PanelField>
                    <div className="grid grid-cols-2 gap-2">
                      <PanelField label="提供商" required>
                        <Input
                          value={form.provider}
                          onChange={(e) =>
                            setForm({ ...form, provider: e.target.value })
                          }
                          placeholder="openai"
                          required
                        />
                      </PanelField>
                      <PanelField label="类型">
                        <Select
                          value={form.model_type}
                          onValueChange={(v) =>
                            setForm({ ...form, model_type: v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="api">API</SelectItem>
                            <SelectItem value="local">本地</SelectItem>
                            <SelectItem value="huggingface">HuggingFace</SelectItem>
                          </SelectContent>
                        </Select>
                      </PanelField>
                    </div>
                    {form.model_type === "huggingface" ? (
                      <>
                        <PanelField label="HuggingFace 模型 ID" required>
                          <Input
                            value={form.model_name}
                            onChange={(e) =>
                              setForm({ ...form, model_name: e.target.value })
                            }
                            placeholder="Qwen/Qwen2.5-0.5B-Instruct"
                            className="font-mono"
                            required
                          />
                          <p className="text-[11px] text-muted-foreground mt-1">
                            HuggingFace 模型仓库 ID，将通过 Inference API 调用
                          </p>
                        </PanelField>
                        <PanelField label="HF Token">
                          <Input
                            type="password"
                            value={form.api_key}
                            onChange={(e) =>
                              setForm({ ...form, api_key: e.target.value })
                            }
                            placeholder="hf_..."
                          />
                        </PanelField>
                      </>
                    ) : (
                      <>
                        <PanelField label="API 协议">
                          <Select
                            value={form.api_format}
                            onValueChange={(v) =>
                              setForm({ ...form, api_format: v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="openai">OpenAI</SelectItem>
                              <SelectItem value="anthropic">Anthropic</SelectItem>
                            </SelectContent>
                          </Select>
                        </PanelField>
                        <PanelField label="模型 ID">
                          <Input
                            value={form.model_name}
                            onChange={(e) =>
                              setForm({ ...form, model_name: e.target.value })
                            }
                            placeholder="gpt-4o-2024-08-06"
                            className="font-mono"
                          />
                        </PanelField>
                        <PanelField label="端点 URL" required>
                          <Input
                            value={form.endpoint_url}
                            onChange={(e) =>
                              setForm({ ...form, endpoint_url: e.target.value })
                            }
                            placeholder="https://api.openai.com/v1/..."
                            className="font-mono"
                            required
                          />
                        </PanelField>
                        <PanelField label="API 密钥">
                          <Input
                            type="password"
                            value={form.api_key}
                            onChange={(e) =>
                              setForm({ ...form, api_key: e.target.value })
                            }
                            placeholder="sk-..."
                          />
                        </PanelField>
                      </>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <PanelField label="最大 Token">
                        <Input
                          type="number"
                          value={form.max_tokens}
                          onChange={(e) =>
                            setForm({ ...form, max_tokens: e.target.value })
                          }
                        />
                      </PanelField>
                    </div>
                    <PanelField label="描述">
                      <Input
                        value={form.description}
                        onChange={(e) =>
                          setForm({ ...form, description: e.target.value })
                        }
                        placeholder="备注（可选）"
                      />
                    </PanelField>
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
                        {create.isPending ? "添加中..." : "添加模型"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              )}

              {/* View mode — inline editable */}
              {selectedModel && !isCreating && (
                <CardContent className="pt-0 space-y-4">
                  {selectedModel.description && (
                    <p className="text-xs text-muted-foreground">
                      {selectedModel.description}
                    </p>
                  )}

                  <div className="space-y-2.5">
                    <DetailRow label="提供商" value={selectedModel.provider} />
                    <DetailRow
                      label="类型"
                      value={
                        <Badge
                          variant="outline"
                          className="text-xs font-normal"
                        >
                          {typeLabel[selectedModel.model_type] ??
                            selectedModel.model_type}
                        </Badge>
                      }
                    />
                    <EditableSelect
                      label="API 协议"
                      value={selectedModel.api_format}
                      displayValue={
                        apiFormatLabel[selectedModel.api_format] ??
                        selectedModel.api_format
                      }
                      options={[
                        { value: "openai", label: "OpenAI" },
                        { value: "anthropic", label: "Anthropic" },
                      ]}
                      onSave={(v) =>
                        update.mutate({
                          id: selectedModel.id,
                          api_format: v,
                        })
                      }
                    />
                    <EditableText
                      label="模型 ID"
                      value={selectedModel.model_name}
                      mono
                      onSave={(v) =>
                        update.mutate({
                          id: selectedModel.id,
                          model_name: v,
                        })
                      }
                    />
                    <EditableText
                      label="端点"
                      value={selectedModel.endpoint_url}
                      mono
                      small
                      onSave={(v) =>
                        update.mutate({
                          id: selectedModel.id,
                          endpoint_url: v,
                        })
                      }
                    />
                    <EditableText
                      label="最大 Token"
                      value={
                        selectedModel.max_tokens
                          ? String(selectedModel.max_tokens)
                          : ""
                      }
                      mono
                      placeholder="未设置"
                      onSave={(v) =>
                        update.mutate({
                          id: selectedModel.id,
                          max_tokens: v ? parseInt(v) : null,
                        })
                      }
                    />
                    <EditableText
                      label="描述"
                      value={selectedModel.description}
                      placeholder="无描述"
                      onSave={(v) =>
                        update.mutate({
                          id: selectedModel.id,
                          description: v,
                        })
                      }
                    />
                    <DetailRow
                      label="注册时间"
                      value={utc(selectedModel.created_at)?.toLocaleString()}
                    />
                  </div>

                  {/* Test result banner */}
                  {testResults[selectedModel.id] &&
                    testResults[selectedModel.id].message !== "测试中..." && (
                      <div
                        className={`rounded-md px-3 py-2 text-xs ${
                          testResults[selectedModel.id].ok
                            ? "bg-emerald-500/10 text-emerald-700"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {testResults[selectedModel.id].message}
                      </div>
                    )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleTest(selectedModel.id)}
                      disabled={testingId === selectedModel.id}
                    >
                      {testingId === selectedModel.id ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      测试连接
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive hover:bg-destructive/5"
                      onClick={() =>
                        setDeleteTarget({
                          id: selectedModel.id,
                          name: selectedModel.name,
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
            <DialogTitle>删除模型</DialogTitle>
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

function EditableText({
  label,
  value,
  mono,
  small,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
  placeholder?: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  if (editing) {
    return (
      <div className="flex items-start justify-between gap-3 text-xs">
        <span className="text-muted-foreground shrink-0 pt-1.5">{label}</span>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className={`h-7 text-xs text-right ${mono ? "font-mono" : ""}`}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-start justify-between gap-3 text-xs group/edit cursor-pointer rounded-sm px-1 -mx-1 py-0.5 -my-0.5 hover:bg-muted/60 transition-colors"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      <span className="text-muted-foreground shrink-0 pt-0.5">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        {value ? (
          <span
            className={`truncate max-w-[180px] ${mono ? "font-mono" : ""} ${small ? "text-[11px]" : ""}`}
          >
            {value}
          </span>
        ) : (
          <span className="text-muted-foreground/50 italic">
            {placeholder ?? "—"}
          </span>
        )}
        <Pencil className="h-2.5 w-2.5 text-muted-foreground/30 group-hover/edit:text-muted-foreground/60 transition-colors shrink-0" />
      </div>
    </div>
  );
}

function EditableSelect({
  label,
  value,
  displayValue,
  options,
  onSave,
}: {
  label: string;
  value: string;
  displayValue: string;
  options: { value: string; label: string }[];
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="flex items-start justify-between gap-3 text-xs">
        <span className="text-muted-foreground shrink-0 pt-1.5">{label}</span>
        <Select
          value={value}
          onValueChange={(v) => {
            setEditing(false);
            if (v !== value) onSave(v);
          }}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(false);
          }}
        >
          <SelectTrigger className="h-7 text-xs w-auto min-w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div
      className="flex items-start justify-between gap-3 text-xs group/edit cursor-pointer rounded-sm px-1 -mx-1 py-0.5 -my-0.5 hover:bg-muted/60 transition-colors"
      onClick={() => setEditing(true)}
    >
      <span className="text-muted-foreground shrink-0 pt-0.5">{label}</span>
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="text-xs font-normal">
          {displayValue}
        </Badge>
        <Pencil className="h-2.5 w-2.5 text-muted-foreground/30 group-hover/edit:text-muted-foreground/60 transition-colors shrink-0" />
      </div>
    </div>
  );
}

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Copy,
  Check,
} from "lucide-react";
import {
  useModels,
  useCreateModel,
  useDeleteModel,
  useTestModel,
} from "@/lib/hooks/use-models";
import type { LLMModel } from "@/lib/types";

const typeLabel: Record<string, string> = {
  api: "API",
  local: "本地",
  huggingface: "HuggingFace",
};

export default function ModelsPage() {
  const { data: models = [], isLoading } = useModels();
  const create = useCreateModel();
  const deleteMut = useDeleteModel();
  const testModel = useTestModel();

  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("__all__");
  const [sorting, setSorting] = useState<SortingState>([]);

  const [form, setForm] = useState({
    name: "",
    provider: "",
    endpoint_url: "",
    api_key: "",
    model_type: "api" as string,
    description: "",
    model_name: "",
    max_tokens: "4096",
  });

  const resetForm = () => {
    setForm({
      name: "",
      provider: "",
      endpoint_url: "",
      api_key: "",
      model_type: "api",
      description: "",
      model_name: "",
      max_tokens: "4096",
    });
    setShowForm(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({
      name: form.name,
      provider: form.provider,
      endpoint_url: form.endpoint_url,
      api_key: form.api_key || undefined,
      model_type: form.model_type,
      description: form.description || undefined,
      model_name: form.model_name || undefined,
      max_tokens: form.max_tokens ? parseInt(form.max_tokens) : undefined,
    });
    resetForm();
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
    if (selectedId === deleteTarget.id) setSelectedId(null);
    await deleteMut.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const selectedModel = models.find((m) => m.id === selectedId);

  // Filtered data for type filter
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
          <span className="font-mono text-xs text-muted-foreground truncate block max-w-[180px]">
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: "status",
        header: "连接",
        cell: ({ row }) => {
          const r = testResults[row.original.id];
          if (!r) return <span className="text-xs text-muted-foreground">—</span>;
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
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
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
      {/* Header with inline stats */}
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
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          variant={showForm ? "outline" : "default"}
        >
          {showForm ? (
            <>
              <X className="mr-1 h-4 w-4" /> 取消
            </>
          ) : (
            <>
              <Plus className="mr-1 h-4 w-4" /> 添加模型
            </>
          )}
        </Button>
      </div>

      {/* Inline creation form */}
      {showForm && (
        <Card>
          <CardContent className="pt-5">
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">显示名称 *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    placeholder="GPT-4o"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">提供商 *</Label>
                  <Input
                    value={form.provider}
                    onChange={(e) =>
                      setForm({ ...form, provider: e.target.value })
                    }
                    placeholder="openai"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">模型 ID</Label>
                  <Input
                    value={form.model_name}
                    onChange={(e) =>
                      setForm({ ...form, model_name: e.target.value })
                    }
                    placeholder="gpt-4o-2024-08-06"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">类型</Label>
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
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">端点 URL *</Label>
                  <Input
                    value={form.endpoint_url}
                    onChange={(e) =>
                      setForm({ ...form, endpoint_url: e.target.value })
                    }
                    placeholder="https://api.openai.com/v1/chat/completions"
                    className="font-mono"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">API 密钥</Label>
                  <Input
                    type="password"
                    value={form.api_key}
                    onChange={(e) =>
                      setForm({ ...form, api_key: e.target.value })
                    }
                    placeholder="sk-..."
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">最大 Token</Label>
                  <Input
                    type="number"
                    value={form.max_tokens}
                    onChange={(e) =>
                      setForm({ ...form, max_tokens: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">描述</Label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="模型配置备注..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetForm}
                >
                  取消
                </Button>
                <Button type="submit" size="sm" disabled={create.isPending}>
                  {create.isPending ? "添加中..." : "添加模型"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Search + filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="搜索模型名称、提供商、端点..."
            className="pl-9 h-9 rounded-full bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-input"
          />
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-muted/50 p-1">
          <button
            onClick={() => setTypeFilter("__all__")}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
              typeFilter === "__all__"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            全部
          </button>
          {Object.entries(typeCounts).map(([type, count]) => (
            <button
              key={type}
              onClick={() =>
                setTypeFilter(typeFilter === type ? "__all__" : type)
              }
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                typeFilter === type
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {typeLabel[type] ?? type}
              <span className="ml-1 tabular-nums opacity-60">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main content: table + detail panel */}
      <div className="flex gap-4 min-h-0">
        {/* Table */}
        <Card className={selectedModel ? "flex-1" : "w-full"}>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                加载中...
              </div>
            ) : table.getRowModel().rows.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                {models.length === 0
                  ? "暂无已注册的模型。"
                  : "无匹配结果。"}
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
                      className={`cursor-pointer transition-colors ${
                        selectedId === row.original.id
                          ? "bg-accent"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() =>
                        setSelectedId(
                          selectedId === row.original.id
                            ? null
                            : row.original.id,
                        )
                      }
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
                        <ChevronRight
                          className={`h-3.5 w-3.5 text-muted-foreground/40 transition-transform ${
                            selectedId === row.original.id ? "rotate-90" : ""
                          }`}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Detail panel */}
        {selectedModel && (
          <Card className="w-80 shrink-0 self-start">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium truncate">
                  {selectedModel.name}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => setSelectedId(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              {selectedModel.description && (
                <p className="text-xs text-muted-foreground">
                  {selectedModel.description}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {/* Fields */}
              <div className="space-y-2">
                <DetailField
                  label="提供商"
                  value={selectedModel.provider}
                />
                <DetailField
                  label="类型"
                  value={
                    <Badge variant="outline" className="text-xs font-normal">
                      {typeLabel[selectedModel.model_type] ??
                        selectedModel.model_type}
                    </Badge>
                  }
                />
                {selectedModel.model_name && (
                  <DetailField
                    label="模型 ID"
                    value={
                      <div className="flex items-center gap-1">
                        <code className="font-mono truncate">
                          {selectedModel.model_name}
                        </code>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              selectedModel.model_name,
                              "model_name",
                            )
                          }
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          {copiedField === "model_name" ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    }
                  />
                )}
                <DetailField
                  label="端点"
                  value={
                    <div className="flex items-center gap-1">
                      <code className="font-mono truncate text-[11px]">
                        {selectedModel.endpoint_url}
                      </code>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            selectedModel.endpoint_url,
                            "endpoint",
                          )
                        }
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        {copiedField === "endpoint" ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  }
                />
                {selectedModel.max_tokens && (
                  <DetailField
                    label="最大 Token"
                    value={
                      <span className="font-mono">
                        {selectedModel.max_tokens.toLocaleString()}
                      </span>
                    }
                  />
                )}
                <DetailField
                  label="注册时间"
                  value={new Date(
                    selectedModel.created_at,
                  ).toLocaleString()}
                />
              </div>

              {/* Test result */}
              {testResults[selectedModel.id] &&
                testResults[selectedModel.id].message !== "测试中..." && (
                  <div
                    className={`rounded-md p-2.5 text-xs ${
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
                  className="flex-1 h-8 text-xs"
                  onClick={() => handleTest(selectedModel.id)}
                  disabled={testingId === selectedModel.id}
                >
                  {testingId === selectedModel.id ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Zap className="mr-1 h-3 w-3" />
                  )}
                  测试连接
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs text-destructive hover:text-destructive"
                  onClick={() =>
                    setDeleteTarget({
                      id: selectedModel.id,
                      name: selectedModel.name,
                    })
                  }
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除模型</DialogTitle>
            <DialogDescription>
              确定要删除 &quot;{deleteTarget?.name}&quot; 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
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

function DetailField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <div className="text-right min-w-0 truncate">{value}</div>
    </div>
  );
}

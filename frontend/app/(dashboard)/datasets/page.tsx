"use client";

import { useState, useMemo, useRef } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Loader2,
  Search,
  ArrowUpDown,
  X,
  ChevronRight,
  Copy,
  Check,
  ClipboardPaste,
  Eye,
  Upload,
  FolderOpen,
} from "lucide-react";
import {
  useDatasets,
  useUploadDataset,
  useMountDataset,
  useDeleteDataset,
  useDatasetPreview,
} from "@/lib/hooks/use-datasets";
import type { Dataset } from "@/lib/types";
import { utc } from "@/lib/utils";

const sourceTypeLabel: Record<string, string> = {
  upload: "上传",
  huggingface: "HuggingFace",
  modelscope: "ModelScope",
  server_path: "服务器路径",
  preset: "预设",
};

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

type PanelMode = { kind: "view"; id: string } | { kind: "create" } | null;

const emptyUploadForm = {
  name: "",
  description: "",
  tags: "",
};

const emptyMountForm = {
  name: "",
  description: "",
  server_path: "",
  format: "jsonl",
  tags: "",
};

export default function DatasetsPage() {
  const { data: datasetsData, isLoading } = useDatasets();
  const datasets = useMemo(() => datasetsData?.items ?? [], [datasetsData]);
  const upload = useUploadDataset();
  const mount = useMountDataset();
  const deleteMut = useDeleteDataset();

  const [panel, setPanel] = useState<PanelMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("__all__");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [uploadForm, setUploadForm] = useState({ ...emptyUploadForm });
  const [mountForm, setMountForm] = useState({ ...emptyMountForm });
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = useDatasetPreview(previewId ?? "", !!previewId);

  const selectedId = panel?.kind === "view" ? panel.id : null;
  const isCreating = panel?.kind === "create";
  const selectedDataset = datasets.find((d) => d.id === selectedId);
  const panelOpen = !!panel;

  const openCreate = () => {
    setUploadForm({ ...emptyUploadForm });
    setMountForm({ ...emptyMountForm });
    setPanel({ kind: "create" });
  };

  const openView = (id: string) => {
    setPanel(panel?.kind === "view" && panel.id === id ? null : { kind: "view", id });
  };

  const closePanel = () => setPanel(null);
  const [importError, setImportError] = useState("");

  const importDatasetJson = (text: string) => {
    setImportError("");
    try {
      const data = JSON.parse(text);
      if (data.server_path || data.source_uri) {
        setMountForm((f) => ({
          ...f,
          name: data.name ?? f.name,
          server_path: data.server_path ?? data.source_uri ?? f.server_path,
          format: data.format ?? f.format,
          tags: data.tags ?? f.tags,
          description: data.description ?? f.description,
        }));
      } else {
        setUploadForm((f) => ({
          ...f,
          name: data.name ?? f.name,
          tags: data.tags ?? f.tags,
          description: data.description ?? f.description,
        }));
      }
    } catch {
      setImportError("无法解析 JSON");
      setTimeout(() => setImportError(""), 3000);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    await upload.mutateAsync({
      file,
      name: uploadForm.name || file.name,
      description: uploadForm.description,
      tags: uploadForm.tags,
    });
    setUploadForm({ ...emptyUploadForm });
    closePanel();
  };

  const handleMount = async (e: React.FormEvent) => {
    e.preventDefault();
    await mount.mutateAsync({
      name: mountForm.name,
      description: mountForm.description,
      server_path: mountForm.server_path,
      format: mountForm.format,
      tags: mountForm.tags,
    });
    setMountForm({ ...emptyMountForm });
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

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const filteredData = useMemo(
    () =>
      sourceFilter === "__all__"
        ? datasets
        : datasets.filter((d) => d.source_type === sourceFilter),
    [datasets, sourceFilter],
  );

  const columns = useMemo<ColumnDef<Dataset>[]>(
    () => [
      {
        accessorKey: "name",
        header: "名称",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium truncate">{row.original.name}</p>
            {row.original.description && (
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                {row.original.description}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "source_type",
        header: "来源",
        cell: ({ getValue }) => (
          <Badge variant="outline" className="font-normal">
            {sourceTypeLabel[getValue<string>()] ?? getValue<string>()}
          </Badge>
        ),
      },
      {
        accessorKey: "format",
        header: "格式",
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "row_count",
        header: "行数",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {getValue<number>().toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "size_bytes",
        header: "大小",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {formatBytes(getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: "tags",
        header: "标签",
        cell: ({ getValue }) => {
          const tags = getValue<string>();
          if (!tags) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {tags.split(",").map((t) => (
                <Badge key={t.trim()} variant="secondary" className="text-xs font-normal">
                  {t.trim()}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        accessorKey: "version",
        header: "版本",
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">v{getValue<number>()}</span>
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

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of datasets) {
      counts[d.source_type] = (counts[d.source_type] || 0) + 1;
    }
    return counts;
  }, [datasets]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <h1 className="text-lg font-semibold">数据集管理</h1>
          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              共{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {datasets.length}
              </span>{" "}
              个数据集
            </span>
            {Object.entries(sourceCounts).map(([type, count]) => (
              <span key={type}>
                {sourceTypeLabel[type] ?? type}{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {count}
                </span>
              </span>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={openCreate} disabled={isCreating}>
          <Plus className="mr-1 h-4 w-4" /> 添加数据集
        </Button>
      </div>

      {/* Toolbar: search + filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="搜索数据集名称、格式、标签..."
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center h-9 border rounded-md overflow-hidden">
          {[
            { key: "__all__", label: "全部" },
            ...Object.entries(sourceCounts).map(([type, count]) => ({
              key: type,
              label: `${sourceTypeLabel[type] ?? type} ${count}`,
            })),
          ].map((item, i, arr) => (
            <button
              key={item.key}
              onClick={() =>
                setSourceFilter(
                  item.key === "__all__"
                    ? "__all__"
                    : sourceFilter === item.key
                      ? "__all__"
                      : item.key,
                )
              }
              className={`h-full px-3.5 text-xs font-medium transition-colors ${
                i < arr.length - 1 ? "border-r" : ""
              } ${
                sourceFilter === item.key
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
                {datasets.length === 0 ? (
                  <div className="space-y-2">
                    <p>暂无数据集</p>
                    <Button size="sm" variant="outline" onClick={openCreate}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> 添加第一个数据集
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
                            className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="复制信息"
                              onClick={() => {
                                const d = row.original;
                                const config = {
                                  name: d.name,
                                  source_type: d.source_type,
                                  source_uri: d.source_uri,
                                  format: d.format,
                                  tags: d.tags,
                                  row_count: d.row_count,
                                };
                                navigator.clipboard.writeText(
                                  JSON.stringify(config, null, 2),
                                );
                                setCopiedRowId(d.id);
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
                              title="预览"
                              onClick={() => setPreviewId(row.original.id)}
                            >
                              <Eye className="h-3.5 w-3.5" />
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

        {/* Side panel: view OR create */}
        {panelOpen && (
          <div className="w-80 shrink-0">
            <Card className="sticky top-4">
              {/* Panel header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h3 className="text-sm font-semibold truncate">
                  {isCreating
                    ? "添加数据集"
                    : selectedDataset?.name ?? ""}
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
                  <div className="flex items-center gap-1.5 mb-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs flex-1"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          importDatasetJson(text);
                        } catch {
                          setImportError("无法读取剪贴板");
                          setTimeout(() => setImportError(""), 3000);
                        }
                      }}
                    >
                      <ClipboardPaste className="mr-1.5 h-3 w-3" />
                      从剪贴板导入
                    </Button>
                    <label className="flex-1">
                      <input
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () =>
                            importDatasetJson(reader.result as string);
                          reader.readAsText(file);
                          e.target.value = "";
                        }}
                      />
                      <span className="inline-flex items-center justify-center h-7 text-xs px-3 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors w-full">
                        导入 JSON
                      </span>
                    </label>
                  </div>
                  {importError && (
                    <p className="text-xs text-destructive mb-2">{importError}</p>
                  )}

                  <Tabs defaultValue="upload">
                    <TabsList className="w-full">
                      <TabsTrigger value="upload" className="flex-1">
                        <Upload className="mr-1 h-3.5 w-3.5" /> 上传文件
                      </TabsTrigger>
                      <TabsTrigger value="mount" className="flex-1">
                        <FolderOpen className="mr-1 h-3.5 w-3.5" /> 服务器路径
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="upload">
                      <form onSubmit={handleUpload} className="space-y-3">
                        <PanelField label="文件 (JSONL / CSV / JSON)" required>
                          <Input
                            ref={fileRef}
                            type="file"
                            accept=".jsonl,.csv,.json"
                            required
                          />
                        </PanelField>
                        <PanelField label="名称">
                          <Input
                            value={uploadForm.name}
                            onChange={(e) =>
                              setUploadForm({ ...uploadForm, name: e.target.value })
                            }
                            placeholder="默认使用文件名"
                          />
                        </PanelField>
                        <PanelField label="标签">
                          <Input
                            value={uploadForm.tags}
                            onChange={(e) =>
                              setUploadForm({ ...uploadForm, tags: e.target.value })
                            }
                            placeholder="math,reasoning"
                          />
                        </PanelField>
                        <PanelField label="描述">
                          <Input
                            value={uploadForm.description}
                            onChange={(e) =>
                              setUploadForm({
                                ...uploadForm,
                                description: e.target.value,
                              })
                            }
                            placeholder="备注（可选）"
                          />
                        </PanelField>
                        <div className="pt-1">
                          <Button
                            type="submit"
                            className="w-full"
                            disabled={upload.isPending}
                          >
                            {upload.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="mr-2 h-4 w-4" />
                            )}
                            {upload.isPending ? "上传中..." : "上传"}
                          </Button>
                        </div>
                      </form>
                    </TabsContent>

                    <TabsContent value="mount">
                      <form onSubmit={handleMount} className="space-y-3">
                        <PanelField label="服务器路径" required>
                          <Input
                            value={mountForm.server_path}
                            onChange={(e) =>
                              setMountForm({
                                ...mountForm,
                                server_path: e.target.value,
                              })
                            }
                            placeholder="/data/datasets/eval.jsonl"
                            className="font-mono"
                            required
                          />
                        </PanelField>
                        <PanelField label="名称" required>
                          <Input
                            value={mountForm.name}
                            onChange={(e) =>
                              setMountForm({ ...mountForm, name: e.target.value })
                            }
                            placeholder="数据集名称"
                            required
                          />
                        </PanelField>
                        <div className="grid grid-cols-2 gap-2">
                          <PanelField label="格式">
                            <Input
                              value={mountForm.format}
                              onChange={(e) =>
                                setMountForm({ ...mountForm, format: e.target.value })
                              }
                              placeholder="jsonl"
                            />
                          </PanelField>
                          <PanelField label="标签">
                            <Input
                              value={mountForm.tags}
                              onChange={(e) =>
                                setMountForm({ ...mountForm, tags: e.target.value })
                              }
                              placeholder="math,reasoning"
                            />
                          </PanelField>
                        </div>
                        <PanelField label="描述">
                          <Input
                            value={mountForm.description}
                            onChange={(e) =>
                              setMountForm({
                                ...mountForm,
                                description: e.target.value,
                              })
                            }
                            placeholder="备注（可选）"
                          />
                        </PanelField>
                        <div className="pt-1">
                          <Button
                            type="submit"
                            className="w-full"
                            disabled={mount.isPending}
                          >
                            {mount.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <FolderOpen className="mr-2 h-4 w-4" />
                            )}
                            {mount.isPending ? "挂载中..." : "挂载路径"}
                          </Button>
                        </div>
                      </form>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              )}

              {/* View mode */}
              {selectedDataset && !isCreating && (
                <CardContent className="pt-0 space-y-4">
                  <div className="space-y-2.5">
                    <DetailRow label="名称" value={selectedDataset.name} />
                    {selectedDataset.description && (
                      <DetailRow
                        label="描述"
                        value={
                          <span className="text-xs">{selectedDataset.description}</span>
                        }
                      />
                    )}
                    <DetailRow
                      label="来源类型"
                      value={
                        <Badge
                          variant="outline"
                          className="text-xs font-normal"
                        >
                          {sourceTypeLabel[selectedDataset.source_type] ??
                            selectedDataset.source_type}
                        </Badge>
                      }
                    />
                    {selectedDataset.source_uri && (
                      <DetailRow
                        label="来源路径"
                        value={
                          <CopyableCode
                            text={selectedDataset.source_uri}
                            field="source_uri"
                            copiedField={copiedField}
                            onCopy={copyToClipboard}
                            small
                          />
                        }
                      />
                    )}
                    <DetailRow
                      label="格式"
                      value={selectedDataset.format}
                    />
                    <DetailRow
                      label="行数"
                      value={
                        <span className="font-mono">
                          {selectedDataset.row_count.toLocaleString()}
                        </span>
                      }
                    />
                    <DetailRow
                      label="大小"
                      value={
                        <span className="font-mono">
                          {formatBytes(selectedDataset.size_bytes)}
                        </span>
                      }
                    />
                    <DetailRow
                      label="版本"
                      value={`v${selectedDataset.version}`}
                    />
                    {selectedDataset.tags && (
                      <DetailRow
                        label="标签"
                        value={
                          <div className="flex flex-wrap gap-1 justify-end">
                            {selectedDataset.tags.split(",").map((t) => (
                              <Badge
                                key={t.trim()}
                                variant="secondary"
                                className="text-xs font-normal"
                              >
                                {t.trim()}
                              </Badge>
                            ))}
                          </div>
                        }
                      />
                    )}
                    <DetailRow
                      label="创建时间"
                      value={utc(selectedDataset.created_at)?.toLocaleString()}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setPreviewId(selectedDataset.id)}
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      预览
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive hover:bg-destructive/5"
                      onClick={() =>
                        setDeleteTarget({
                          id: selectedDataset.id,
                          name: selectedDataset.name,
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

      {/* Preview Dialog */}
      <Dialog open={!!previewId} onOpenChange={() => setPreviewId(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>数据集预览</DialogTitle>
            <DialogDescription>
              显示数据集的前几行数据
            </DialogDescription>
          </DialogHeader>
          {preview.isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              加载中...
            </div>
          ) : preview.data?.rows.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">暂无数据</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {preview.data?.rows[0] &&
                      Object.keys(preview.data.rows[0]).map((k) => (
                        <TableHead key={k}>{k}</TableHead>
                      ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.data?.rows.map((row, i) => (
                    <TableRow key={i}>
                      {Object.values(row).map((v, j) => (
                        <TableCell key={j} className="max-w-xs truncate">
                          {String(v)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-muted-foreground">
                显示 {preview.data?.rows.length} / {preview.data?.total} 行
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => { setDeleteTarget(null); setDeleteError(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除数据集</DialogTitle>
            <DialogDescription>
              确定要删除 &quot;{deleteTarget?.name}&quot; 吗？此操作不可撤销。
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

function CopyableCode({
  text,
  field,
  copiedField,
  onCopy,
  small,
}: {
  text: string;
  field: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
  small?: boolean;
}) {
  return (
    <div className="flex items-center gap-1 justify-end">
      <code
        className={`font-mono truncate max-w-[160px] ${small ? "text-[11px]" : ""}`}
      >
        {text}
      </code>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCopy(text, field);
        }}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        {copiedField === field ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

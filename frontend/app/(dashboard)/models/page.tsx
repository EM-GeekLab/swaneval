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
import { Badge } from "@/components/ui/badge";
import { CreateModal } from "@/components/create-modal";
import { SelectionBar } from "@/components/selection-bar";
import { DeleteDialog } from "@/components/delete-dialog";
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
  ArrowUpDown,
  X,
  ChevronRight,
  Copy,
  Check,
  Cpu,
} from "lucide-react";
import { TableEmpty, TableLoading } from "@/components/table-states";
import { PageHeader, SearchToolbar } from "@/components/page-header";
import {
  useModels,
  useDeleteModel,
  useTestModel,
} from "@/lib/hooks/use-models";
import type { LLMModel } from "@/lib/types";
import { extractErrorDetail } from "@/lib/utils";
import { RefreshIndicator } from "@/components/refresh-indicator";
import { FilterDropdown } from "@/components/filter-dropdown";
import { TablePagination } from "@/components/table-pagination";
import { ModelDetailPanel } from "@/components/models/model-detail-panel";
import { ModelCreateForm } from "@/components/models/model-create-form";

const typeLabel: Record<string, string> = {
  api: "API",
  local: "本地",
  huggingface: "HuggingFace",
};

type PanelMode = { kind: "view"; id: string } | { kind: "create" } | null;

export default function ModelsPage() {
  const { data: models = [], isLoading, isFetching } = useModels();
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
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [createPos, setCreatePos] = useState<{ top: number; right: number } | null>(null);
  const [shakeCancel, setShakeCancel] = useState(false);

  const selectedId = panel?.kind === "view" ? panel.id : null;
  const isCreating = panel?.kind === "create";
  const selectedModel = models.find((m) => m.id === selectedId);
  const viewPanelOpen = panel?.kind === "view";

  // ModelCreateForm manages its own form state, so formDirty is
  // conservatively true whenever the create panel is open.
  const formDirty = isCreating;

  const openCreate = () => {
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
      setDeleteError(extractErrorDetail(err, "删除失败"));
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
            className="h-3.5 w-3.5 rounded border-border accent-primary"
            checked={table.getIsAllPageRowsSelected()}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-border accent-primary"
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
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
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
      <PageHeader
        title="模型管理"
        stats={[
          { label: "共", value: models.length },
          ...Object.entries(typeCounts).map(([type, count]) => ({
            label: typeLabel[type] ?? type,
            value: count,
          })),
        ]}
        trailing={<RefreshIndicator isFetching={isFetching} isLoading={isLoading} />}
        action={
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
              <><Plus className="mr-1 h-4 w-4" /> 添加模型</>
            )}
          </Button>
        }
      />

      {/* Toolbar: search + filter */}
      <SearchToolbar
        value={globalFilter}
        onChange={setGlobalFilter}
        placeholder="搜索模型名称、提供商、端点..."
      >
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
      </SearchToolbar>

      {/* Main: table + side panel */}
      <div className="flex gap-4 min-h-0 items-start">
        {/* Table */}
        <Card className={viewPanelOpen ? "flex-1 min-w-0" : "w-full"}>
          <CardContent className="p-0">
            {isLoading ? (
              <TableLoading />
            ) : table.getRowModel().rows.length === 0 ? (
              models.length === 0 ? (
                <TableEmpty
                  icon={Cpu}
                  title="暂无已注册的模型"
                  description="添加 API 模型、本地模型或 HuggingFace 模型"
                  action={
                    <Button size="sm" variant="outline" onClick={openCreate}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> 添加第一个模型
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
                          className={header.column.getCanSort() ? "cursor-pointer select-none" : ""}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <span className="flex items-center gap-1">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {header.column.getCanSort() && (
                              <ArrowUpDown className="h-3 w-3 text-muted-foreground/60" />
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
                          ? "bg-muted"
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
                            className={`h-3.5 w-3.5 text-muted-foreground/60 transition-transform ${
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

        {/* View panel -- right side */}
        {viewPanelOpen && selectedModel && (
          <ModelDetailPanel
            model={selectedModel}
            onClose={closePanel}
            onDelete={setDeleteTarget}
          />
        )}
      </div>

      {/* Create modal -- expands from Add button */}
      <CreateModal
        open={isCreating}
        position={createPos}
        formDirty={formDirty}
        onClose={closePanel}
        onShake={() => setShakeCancel(true)}
        title="添加模型"
      >
        <ModelCreateForm onSuccess={closePanel} onClose={closePanel} />
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
        title="删除模型"
        name={deleteTarget?.name ?? ""}
        error={deleteError}
        isPending={deleteMut.isPending}
        onConfirm={handleDelete}
        onCancel={() => { setDeleteTarget(null); setDeleteError(""); }}
      />
    </div>
  );
}

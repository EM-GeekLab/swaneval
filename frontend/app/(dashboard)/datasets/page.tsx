"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  ArrowUpDown,
  X,
  ChevronRight,
  Copy,
  Check,
  Eye,
  Database,
} from "lucide-react";
import { TableEmpty, TableLoading } from "@/components/table-states";
import {
  useDatasets,
  useImportDataset,
  useDeleteDataset,
  useDatasetPresets,
} from "@/lib/hooks/use-datasets";
import { extractErrorDetail } from "@/lib/utils";
import { FilterDropdown } from "@/components/filter-dropdown";
import { TablePagination } from "@/components/table-pagination";
import { PresetListPanel, type PresetItem } from "@/components/preset-list-panel";
import { PageHeader, SearchToolbar } from "@/components/page-header";
import { DatasetDetailPanel } from "@/components/datasets/dataset-detail-panel";
import { DatasetCreateForm, type ImportFormState } from "@/components/datasets/dataset-create-form";
import { DatasetPreviewDialog } from "@/components/datasets/dataset-preview-dialog";
import { getDatasetColumns } from "@/components/datasets/dataset-table-columns";

const sourceTypeLabel: Record<string, string> = {
  upload: "上传",
  huggingface: "HuggingFace",
  modelscope: "ModelScope",
  server_path: "服务器路径",
  preset: "预设",
};

type PanelMode = { kind: "view"; id: string } | { kind: "create" } | null;

export default function DatasetsPage() {
  const { data: datasetsData, isLoading } = useDatasets();
  const datasets = useMemo(
    () =>
      (datasetsData?.items ?? []).filter(
        (d) => !(d.source_type === "preset" && d.row_count === 0 && d.size_bytes === 0),
      ),
    [datasetsData],
  );
  const { data: presets = [] } = useDatasetPresets();
  const importDs = useImportDataset();
  const deleteMut = useDeleteDataset();

  const [panel, setPanel] = useState<PanelMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("__all__");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [createTab, setCreateTab] = useState("online");
  const [formDirty, setFormDirty] = useState(false);
  const [importFormOverride, setImportFormOverride] = useState<ImportFormState | null>(null);
  const [presetSelected, setPresetSelected] = useState<string[]>([]);
  const [onlineImportError, setOnlineImportError] = useState("");
  const [shakeCancel, setShakeCancel] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [createPos, setCreatePos] = useState<{ top: number; right: number } | null>(null);

  const selectedId = panel?.kind === "view" ? panel.id : null;
  const isCreating = panel?.kind === "create";
  const selectedDataset = datasets.find((d) => d.id === selectedId);
  const viewPanelOpen = panel?.kind === "view";

  const openCreate = () => {
    setImportFormOverride(null);
    setPresetSelected([]);
    setOnlineImportError("");
    if (addBtnRef.current) {
      const rect = addBtnRef.current.getBoundingClientRect();
      setCreatePos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setPanel({ kind: "create" });
  };

  const openView = (id: string) => {
    setPanel(panel?.kind === "view" && panel.id === id ? null : { kind: "view", id });
  };

  const closePanel = () => setPanel(null);

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
      sourceFilter === "__all__"
        ? datasets
        : datasets.filter((d) => d.source_type === sourceFilter),
    [datasets, sourceFilter],
  );

  const columns = useMemo(() => getDatasetColumns(), []);

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

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of datasets) {
      counts[d.source_type] = (counts[d.source_type] || 0) + 1;
    }
    return counts;
  }, [datasets]);

  const handleDirtyChange = useCallback((dirty: boolean) => setFormDirty(dirty), []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title="数据集管理"
        stats={[
          { label: "共", value: datasets.length },
          ...Object.entries(sourceCounts).map(([type, count]) => ({
            label: sourceTypeLabel[type] ?? type,
            value: count,
          })),
        ]}
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
              <><Plus className="mr-1 h-4 w-4" /> 添加数据集</>
            )}
          </Button>
        }
      />

      {/* Toolbar */}
      <SearchToolbar
        value={globalFilter}
        onChange={setGlobalFilter}
        placeholder="搜索数据集名称、格式、标签..."
      >
        <FilterDropdown
          label="来源"
          options={Object.entries(sourceCounts).map(([type, count]) => ({
            key: type,
            label: sourceTypeLabel[type] ?? type,
            count,
          }))}
          value={sourceFilter}
          onChange={setSourceFilter}
        />
      </SearchToolbar>

      {/* Main: table + side panel */}
      <div className="flex gap-4 min-h-0">
        <Card className={viewPanelOpen ? "flex-1 min-w-0" : "w-full"}>
          <CardContent className="p-0">
            {isLoading ? (
              <TableLoading />
            ) : table.getRowModel().rows.length === 0 ? (
              datasets.length === 0 ? (
                <TableEmpty
                  icon={Database}
                  title="暂无数据集"
                  description="上传文件、导入在线数据集或挂载服务器路径"
                  action={
                    <Button size="sm" variant="outline" onClick={openCreate}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> 添加第一个数据集
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
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {header.column.getCanSort() && (
                                <ArrowUpDown className="h-3 w-3 text-base-content/30" />
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
                          selectedId === row.original.id ? "bg-base-200" : "hover:bg-base-200/50"
                        }`}
                        onClick={() => openView(row.original.id)}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className="py-2.5"
                            style={cell.column.id === "select" ? { width: 40 } : undefined}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
                                  navigator.clipboard.writeText(
                                    JSON.stringify({ name: d.name, source_type: d.source_type, source_uri: d.source_uri, format: d.format, tags: d.tags, row_count: d.row_count }, null, 2),
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
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="预览" onClick={() => setPreviewId(row.original.id)}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-error hover:text-error hover:bg-error/10"
                                title="删除"
                                onClick={() => setDeleteTarget({ id: row.original.id, name: row.original.name })}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <ChevronRight
                              className={`h-3.5 w-3.5 text-base-content/30 transition-transform ${
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

        {viewPanelOpen && selectedDataset && (
          <DatasetDetailPanel
            dataset={selectedDataset}
            onClose={closePanel}
            onPreview={(id) => setPreviewId(id)}
            onDelete={setDeleteTarget}
          />
        )}
      </div>

      {/* Create modal */}
      <CreateModal
        open={isCreating}
        position={createPos}
        formDirty={formDirty}
        onClose={closePanel}
        onShake={() => setShakeCancel(true)}
        title="添加数据集"
        sidePanel={
          createTab === "online" ? (
            <PresetListPanel
              title="预设基准数据集"
              loading={presets.length === 0}
              items={presets.map((p): PresetItem => ({
                key: p.hf_id,
                name: p.name,
                description: p.description,
                tags: p.tags,
                badge: p.split,
                done: (datasetsData?.items ?? []).some((d) => d.name === p.name && d.row_count > 0),
              }))}
              selected={presetSelected}
              onSelectionChange={(keys) => {
                setPresetSelected(keys);
                const key = keys[keys.length - 1];
                const p = presets.find((x) => x.hf_id === key);
                if (p) {
                  setImportFormOverride({
                    source: "huggingface", dataset_id: p.hf_id, name: p.name,
                    subset: "", split: p.split, description: p.description, tags: p.tags,
                  });
                }
              }}
              onConfirm={async (keys) => {
                setOnlineImportError("");
                for (const key of keys) {
                  const p = presets.find((x) => x.hf_id === key);
                  if (!p) continue;
                  try {
                    await importDs.mutateAsync({
                      source: "huggingface", dataset_id: p.hf_id, name: p.name,
                      split: p.split, description: p.description, tags: p.tags,
                    });
                  } catch (err: unknown) {
                    setOnlineImportError(extractErrorDetail(err, "导入失败"));
                    return;
                  }
                }
                setPresetSelected([]);
              }}
              confirmLabel="下载导入"
              confirming={importDs.isPending}
              error={onlineImportError}
            />
          ) : undefined
        }
      >
        <DatasetCreateForm
          onSuccess={closePanel}
          activeTab={createTab}
          onTabChange={setCreateTab}
          onDirtyChange={handleDirtyChange}
          importFormOverride={importFormOverride}
        />
      </CreateModal>

      {/* Preview Dialog */}
      <DatasetPreviewDialog datasetId={previewId} onClose={() => setPreviewId(null)} />

      {/* Floating selection bar */}
      <SelectionBar
        count={Object.keys(rowSelection).length}
        onDelete={async () => {
          const ids = Object.keys(rowSelection).map((idx) => filteredData[parseInt(idx)]?.id).filter(Boolean);
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
        title="删除数据集"
        name={deleteTarget?.name ?? ""}
        error={deleteError}
        isPending={deleteMut.isPending}
        onConfirm={handleDelete}
        onCancel={() => { setDeleteTarget(null); setDeleteError(""); }}
      />
    </div>
  );
}

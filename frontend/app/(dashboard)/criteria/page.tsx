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
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  X,
  ChevronRight,
  ArrowUpDown,
  Ruler,
} from "lucide-react";
import { TableEmpty, TableLoading } from "@/components/table-states";
import { PageHeader, SearchToolbar } from "@/components/page-header";
import {
  useCriteria,
  useCriteriaPresets,
  useCreateCriterion,
  useDeleteCriterion,
  useTestCriterion,
} from "@/lib/hooks/use-criteria";
import { useModels } from "@/lib/hooks/use-models";
import type { Criterion } from "@/lib/types";
import { utc, extractErrorDetail } from "@/lib/utils";
import { FilterDropdown } from "@/components/filter-dropdown";
import { CreateModal } from "@/components/create-modal";
import { SelectionBar } from "@/components/selection-bar";
import { DeleteDialog } from "@/components/delete-dialog";
import { TablePagination } from "@/components/table-pagination";
import { PresetListPanel, type PresetItem } from "@/components/preset-list-panel";
import { CriterionDetailPanel } from "@/components/criteria/criterion-detail-panel";
import { CriterionCreateForm } from "@/components/criteria/criterion-create-form";

const typeLabel: Record<string, string> = {
  preset: "预设指标",
  regex: "正则",
  script: "脚本",
  llm_judge: "LLM 评判",
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

type PanelMode = { kind: "view"; id: string } | { kind: "create" } | null;

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
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [createPos, setCreatePos] = useState<{ top: number; right: number } | null>(null);

  const selectedId = panel?.kind === "view" ? panel.id : null;
  const isCreating = panel?.kind === "create";
  const selectedCriterion = criteria.find((c) => c.id === selectedId);
  const viewPanelOpen = panel?.kind === "view";
  const [shakeCancel, setShakeCancel] = useState(false);
  const [presetSelected, setPresetSelected] = useState<string[]>([]);
  const [presetError, setPresetError] = useState("");

  // CriterionCreateForm manages its own form state, so formDirty is
  // conservatively true whenever the create panel is open (the modal
  // already prevents accidental close via its own dirty check).
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
      setTestError(extractErrorDetail(err, "测试失败，请检查评估标准配置。"));
    }
  };

  const openTestDialog = (id: string) => {
    setTestId(id);
    setTestResult(null);
    setTestForm({ prompt: "", expected: "", actual: "" });
    setTestError("");
    setTestOpen(true);
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
            className="h-3.5 w-3.5 rounded border-base-300 accent-primary"
            checked={table.getIsAllPageRowsSelected()}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-base-300 accent-primary"
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
          <span className="font-mono text-xs text-base-content/50 truncate block max-w-[200px]">
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "创建时间",
        cell: ({ getValue }) => (
          <span className="text-base-content/50">
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
      <PageHeader
        title="评估标准"
        stats={[
          { label: "共", value: criteria.length },
          ...Object.entries(typeCounts).map(([type, count]) => ({
            label: typeLabel[type] ?? type,
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
              <><Plus className="mr-1 h-4 w-4" /> 新建标准</>
            )}
          </Button>
        }
      />

      {/* Toolbar */}
      <SearchToolbar
        value={globalFilter}
        onChange={setGlobalFilter}
        placeholder="搜索标准名称、配置..."
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
                        selectedId === row.original.id
                          ? "bg-base-200"
                          : "hover:bg-base-200/50"
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
                              onClick={() => openTestDialog(row.original.id)}
                            >
                              <FlaskConical className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-error hover:text-error hover:bg-error/10"
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

        {/* Side panel -- view only */}
        {viewPanelOpen && selectedCriterion && (
          <CriterionDetailPanel
            criterion={selectedCriterion}
            models={models}
            onClose={closePanel}
            onTest={openTestDialog}
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
        <CriterionCreateForm onSuccess={closePanel} onClose={closePanel} />
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
              <div className="rounded bg-error/10 p-3 text-xs text-error">
                {testError}
              </div>
            )}
            {testResult !== null && (
              <div className="rounded bg-base-200 p-3 text-center">
                <span className="text-xs text-base-content/50">得分：</span>
                <span
                  className={`text-lg font-bold ${
                    testResult.score >= 1
                      ? "text-emerald-600"
                      : "text-error"
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

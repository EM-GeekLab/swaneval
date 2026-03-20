"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
  X,
  ChevronRight,
  ArrowUpDown,
  AlertTriangle,
  PlayCircle,
  Trash2,
} from "lucide-react";
import { useTasks, useDeleteTask } from "@/lib/hooks/use-tasks";
import { useDatasets } from "@/lib/hooks/use-datasets";
import { useCriteria } from "@/lib/hooks/use-criteria";
import type { EvalTask } from "@/lib/types";
import { utc, extractErrorDetail } from "@/lib/utils";
import { PageHeader, SearchToolbar } from "@/components/page-header";
import { FilterDropdown } from "@/components/filter-dropdown";
import { CreateModal } from "@/components/create-modal";
import { SelectionBar } from "@/components/selection-bar";
import { DeleteDialog } from "@/components/delete-dialog";
import { TablePagination } from "@/components/table-pagination";
import { TableEmpty, TableLoading } from "@/components/table-states";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import { TaskCreateWizard } from "@/components/tasks/task-create-wizard";
import { statusLabel, statusBadgeVariant, formatDuration } from "@/components/tasks/task-constants";

type PanelMode = { kind: "view"; id: string } | { kind: "create" } | null;

export default function TasksPage() {
  const router = useRouter();
  const { data: tasks = [], isLoading } = useTasks();
  const deleteTask = useDeleteTask();

  const { data: datasetsData } = useDatasets();
  const datasets = useMemo(() => datasetsData?.items ?? [], [datasetsData]);
  const { data: criteria = [] } = useCriteria();

  // 1-second tick so elapsed time updates live for running tasks
  const [, setTick] = useState(0);
  const hasRunning = tasks.some((t) => t.status === "running");
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasRunning]);

  const [panel, setPanel] = useState<PanelMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [shakeCancel, setShakeCancel] = useState(false);
  const [createPos, setCreatePos] = useState<{ top: number; right: number } | null>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const selectedId = panel?.kind === "view" ? panel.id : null;
  const isCreating = panel?.kind === "create";
  const selectedTask = tasks.find((t) => t.id === selectedId);
  const viewPanelOpen = panel?.kind === "view";
  const closePanel = () => setPanel(null);

  const openCreate = () => {
    if (addBtnRef.current) {
      const rect = addBtnRef.current.getBoundingClientRect();
      setCreatePos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setPanel({ kind: "create" });
  };
  const openView = (id: string) => {
    setPanel(panel?.kind === "view" && panel.id === id ? null : { kind: "view", id });
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
        id: "select", size: 32, enableSorting: false, enableResizing: false,
        header: ({ table }) => (
          <input type="checkbox" className="h-3.5 w-3.5 rounded border-base-300 accent-primary"
            checked={table.getIsAllPageRowsSelected()}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)} />
        ),
        cell: ({ row }) => (
          <input type="checkbox" className="h-3.5 w-3.5 rounded border-base-300 accent-primary"
            checked={row.getIsSelected()}
            onChange={(e) => { e.stopPropagation(); row.toggleSelected(e.target.checked); }}
            onClick={(e) => e.stopPropagation()} />
        ),
      },
      {
        accessorKey: "name", header: "名称",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 min-w-0">
            {row.original.status === "failed" && <AlertTriangle className="h-3.5 w-3.5 text-error shrink-0" />}
            <span className="font-medium truncate">{row.original.name}</span>
          </div>
        ),
      },
      {
        accessorKey: "status", header: "状态",
        cell: ({ getValue }) => {
          const s = getValue<string>();
          return <Badge variant={statusBadgeVariant[s] ?? "outline"} className="font-normal">{statusLabel[s] ?? s}</Badge>;
        },
      },
      {
        accessorKey: "repeat_count", header: "重复",
        cell: ({ getValue }) => <span className="text-xs font-mono text-base-content/50">{getValue<number>()}</span>,
      },
      {
        accessorKey: "seed_strategy", header: "种子策略",
        cell: ({ getValue }) => <span className="text-xs text-base-content/50">{getValue<string>() === "fixed" ? "固定" : "随机"}</span>,
      },
      {
        accessorKey: "created_at", header: "创建时间",
        cell: ({ getValue }) => <span className="text-xs text-base-content/50">{utc(getValue<string>())?.toLocaleString()}</span>,
      },
      {
        id: "duration", header: "耗时",
        cell: ({ row }) => <span className="text-xs font-mono text-base-content/50">{formatDuration(row.original.started_at, row.original.finished_at)}</span>,
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="评测任务"
        stats={[
          { label: "总计", value: tasks.length },
          ...Object.entries(statusCounts).map(([status, count]) => ({
            label: statusLabel[status] ?? status,
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
              <><Plus className="mr-1 h-4 w-4" /> 新建任务</>
            )}
          </Button>
        }
      />

      <SearchToolbar
        value={globalFilter}
        onChange={setGlobalFilter}
        placeholder="搜索任务名称..."
      >
        <FilterDropdown
          label="状态"
          options={Object.entries(statusCounts)
            .filter(([, count]) => count > 0)
            .map(([status, count]) => ({
              key: status,
              label: statusLabel[status] ?? status,
              count,
            }))}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </SearchToolbar>

      <div className="flex gap-4 min-h-0">
        <Card className={viewPanelOpen ? "flex-1 min-w-0" : "w-full"}>
          <CardContent className="p-0">
            {isLoading ? (
              <TableLoading />
            ) : table.getRowModel().rows.length === 0 ? (
              tasks.length === 0 ? (
                <TableEmpty
                  icon={PlayCircle}
                  title="暂无评测任务"
                  description="选择模型和数据集，配置参数后启动评测"
                  action={
                    <Button size="sm" variant="outline" onClick={openCreate}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> 创建第一个任务
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
                            className="opacity-0 group-hover/row:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
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

        {viewPanelOpen && selectedTask && (
          <TaskDetailPanel
            task={selectedTask}
            datasets={datasets}
            criteria={criteria}
            onClose={closePanel}
            onDelete={setDeleteTarget}
            onViewDetail={(id) => router.push(`/tasks/${id}`)}
          />
        )}
      </div>

      <CreateModal
        open={isCreating}
        position={createPos}
        formDirty={!!isCreating}
        onClose={closePanel}
        onShake={() => setShakeCancel(true)}
        title="新建任务"
      >
        <TaskCreateWizard
          onSuccess={closePanel}
          onClose={closePanel}
        />
      </CreateModal>

      <SelectionBar
        count={Object.keys(rowSelection).length}
        onDelete={async () => {
          const ids = Object.keys(rowSelection).map(
            (idx) => filteredData[parseInt(idx)]?.id,
          ).filter(Boolean);
          for (const id of ids) {
            try { await deleteTask.mutateAsync(id); } catch { /* skip */ }
          }
          setRowSelection({});
        }}
        onClear={() => setRowSelection({})}
      />

      <DeleteDialog
        open={!!deleteTarget}
        title="删除任务"
        name={deleteTarget?.name ?? ""}
        error={deleteError}
        isPending={deleteTask.isPending}
        onConfirm={async () => {
          setDeleteError("");
          try {
            const id = deleteTarget!.id;
            if (selectedId === id) closePanel();
            await deleteTask.mutateAsync(id);
            setDeleteTarget(null);
          } catch (err: unknown) {
            setDeleteError(extractErrorDetail(err, "删除失败"));
          }
        }}
        onCancel={() => { setDeleteTarget(null); setDeleteError(""); }}
      />
    </div>
  );
}

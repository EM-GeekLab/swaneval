"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import type { Dataset } from "@/lib/types";

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

export function getDatasetColumns(): ColumnDef<Dataset>[] {
  return [
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
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{row.original.name}</p>
          {row.original.description && (
            <p className="text-xs text-base-content/50 truncate max-w-[200px]">
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
        <span className="text-base-content/50">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: "row_count",
      header: "行数",
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-base-content/50">
          {getValue<number>().toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "size_bytes",
      header: "大小",
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-base-content/50">
          {formatBytes(getValue<number>())}
        </span>
      ),
    },
    {
      accessorKey: "tags",
      header: "标签",
      cell: ({ getValue }) => {
        const tags = getValue<string>();
        if (!tags) return <span className="text-xs text-base-content/50">—</span>;
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
        <span className="text-xs text-base-content/50">v{getValue<number>()}</span>
      ),
    },
  ];
}

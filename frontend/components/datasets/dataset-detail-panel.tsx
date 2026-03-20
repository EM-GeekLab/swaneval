"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DetailRow } from "@/components/panel-helpers";
import {
  X,
  Eye,
  Trash2,
  Copy,
  Check,
  Download,
  RefreshCw,
  Bell,
  BellOff,
  Loader2,
} from "lucide-react";
import {
  useDownloadDataset,
  useSubscribeDataset,
  useUnsubscribeDataset,
  useSyncDataset,
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
        className="shrink-0 text-base-content/50 hover:text-base-content transition-colors"
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

interface DatasetDetailPanelProps {
  dataset: Dataset;
  onClose: () => void;
  onPreview: (id: string) => void;
  onDelete: (target: { id: string; name: string }) => void;
}

export function DatasetDetailPanel({
  dataset,
  onClose,
  onPreview,
  onDelete,
}: DatasetDetailPanelProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const downloadDs = useDownloadDataset();
  const subscribeDs = useSubscribeDataset();
  const unsubscribeDs = useUnsubscribeDataset();
  const syncDs = useSyncDataset();

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  return (
    <div className="w-1/3 shrink-0">
      <Card className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-auto">
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold truncate">{dataset.name}</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 -mr-1"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <CardContent className="pt-0 space-y-4">
          <div className="space-y-2.5">
            <DetailRow label="名称" value={dataset.name} />
            {dataset.description && (
              <DetailRow
                label="描述"
                value={<span className="text-xs">{dataset.description}</span>}
              />
            )}
            <DetailRow
              label="来源类型"
              value={
                <Badge variant="outline" className="text-xs font-normal">
                  {sourceTypeLabel[dataset.source_type] ?? dataset.source_type}
                </Badge>
              }
            />
            {dataset.source_uri && (
              <DetailRow
                label="来源路径"
                value={
                  <CopyableCode
                    text={dataset.source_uri}
                    field="source_uri"
                    copiedField={copiedField}
                    onCopy={copyToClipboard}
                    small
                  />
                }
              />
            )}
            <DetailRow label="格式" value={dataset.format} />
            <DetailRow
              label="行数"
              value={
                <span className="font-mono">
                  {dataset.row_count.toLocaleString()}
                </span>
              }
            />
            <DetailRow
              label="大小"
              value={
                <span className="font-mono">
                  {formatBytes(dataset.size_bytes)}
                </span>
              }
            />
            <DetailRow label="版本" value={`v${dataset.version}`} />
            {dataset.tags && (
              <DetailRow
                label="标签"
                value={
                  <div className="flex flex-wrap gap-1 justify-end">
                    {dataset.tags.split(",").map((t) => (
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
              value={utc(dataset.created_at)?.toLocaleString()}
            />
          </div>

          {/* Download banner for empty datasets */}
          {dataset.row_count === 0 &&
            (dataset.source_type === "preset" ||
              dataset.source_type === "huggingface") && (
              <div className="rounded-md bg-base-200 px-3 py-2.5 text-xs text-base-content/50 space-y-2">
                <p>
                  该数据集尚未下载内容，点击下方按钮从 HuggingFace 下载。
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => downloadDs.mutate(dataset.id)}
                  disabled={downloadDs.isPending}
                >
                  {downloadDs.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {downloadDs.isPending ? "下载中..." : "下载数据集内容"}
                </Button>
              </div>
            )}

          {/* Auto-update subscription */}
          {(dataset.source_type === "huggingface" ||
            dataset.source_type === "preset" ||
            dataset.source_type === "modelscope") && (
            <div className="rounded-md border px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">自动更新</span>
                {dataset.auto_update ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px] px-2 text-base-content/50"
                    onClick={() => unsubscribeDs.mutate(dataset.id)}
                    disabled={unsubscribeDs.isPending}
                  >
                    <BellOff className="mr-1 h-3 w-3" />
                    取消订阅
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px] px-2"
                    onClick={() =>
                      subscribeDs.mutate({
                        id: dataset.id,
                        hf_dataset_id:
                          dataset.hf_dataset_id || dataset.source_uri,
                        hf_split: "test",
                        update_interval_hours: 24,
                      })
                    }
                    disabled={subscribeDs.isPending}
                  >
                    <Bell className="mr-1 h-3 w-3" />
                    订阅更新
                  </Button>
                )}
              </div>
              {dataset.auto_update && (
                <div className="space-y-1 text-[11px] text-base-content/50">
                  <div className="flex items-baseline gap-1">
                    <span>状态：</span>
                    <span
                      className={
                        dataset.sync_status === "synced"
                          ? "text-emerald-600"
                          : dataset.sync_status === "syncing"
                            ? "text-primary"
                            : dataset.sync_status === "failed"
                              ? "text-error"
                              : ""
                      }
                    >
                      {dataset.sync_status === "synced"
                        ? "已同步"
                        : dataset.sync_status === "syncing"
                          ? "同步中..."
                          : dataset.sync_status === "failed"
                            ? "同步失败"
                            : "等待首次同步"}
                    </span>
                  </div>
                  {dataset.last_synced_at && (
                    <div>
                      上次同步：
                      {new Date(dataset.last_synced_at).toLocaleString()}
                    </div>
                  )}
                  <div>检查间隔：每 {dataset.update_interval_hours} 小时</div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-[11px] mt-1"
                    onClick={() => syncDs.mutate(dataset.id)}
                    disabled={syncDs.isPending}
                  >
                    {syncDs.isPending ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-3 w-3" />
                    )}
                    {syncDs.isPending ? "同步中..." : "立即同步"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => onPreview(dataset.id)}
              disabled={dataset.row_count === 0}
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              预览
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-error hover:text-error hover:bg-error/5"
              onClick={() => onDelete({ id: dataset.id, name: dataset.name })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

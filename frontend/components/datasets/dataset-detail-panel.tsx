"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  useDatasetVersions,
  useDatasetStats,
  useSyncLogs,
} from "@/lib/hooks/use-datasets";
import type { Dataset, DatasetVersion, DatasetStats, SyncLog, ColumnStats } from "@/lib/types";
import { formatTime, timeAgo } from "@/lib/time";

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

/* ── dtype badge color mapping ─────────────────────────────────── */

const dtypeColor: Record<string, string> = {
  string: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  number: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  boolean: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  array: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
  object: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
};

/* ── Sync status label/color ───────────────────────────────────── */

const syncStatusConfig: Record<string, { label: string; className: string }> = {
  synced: { label: "成功", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
  syncing: { label: "同步中", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  failed: { label: "失败", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  up_to_date: { label: "已是最新", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

/* ── Sub-components ────────────────────────────────────────────── */

function NullRateBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-orange-400"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function StatsTab({ datasetId }: { datasetId: string }) {
  const { data: stats, isLoading, error } = useDatasetStats(datasetId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        加载统计数据...
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground">
        暂无统计数据
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md bg-muted px-2.5 py-2 text-center">
          <div className="text-sm font-semibold tabular-nums">
            {stats.row_count.toLocaleString()}
          </div>
          <div className="text-[10px] text-muted-foreground">行数</div>
        </div>
        <div className="rounded-md bg-muted px-2.5 py-2 text-center">
          <div className="text-sm font-semibold tabular-nums">
            {stats.column_count}
          </div>
          <div className="text-[10px] text-muted-foreground">列数</div>
        </div>
        <div className="rounded-md bg-muted px-2.5 py-2 text-center">
          <div className="text-sm font-semibold tabular-nums">
            {formatBytes(stats.size_bytes)}
          </div>
          <div className="text-[10px] text-muted-foreground">大小</div>
        </div>
      </div>

      {/* Per-column stats */}
      {stats.columns.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">字段统计</h4>
          <div className="space-y-2">
            {stats.columns.map((col: ColumnStats) => (
              <div
                key={col.name}
                className="rounded-md border px-2.5 py-2 space-y-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium truncate">{col.name}</span>
                  <Badge
                    className={`text-[10px] px-1 py-0 h-4 font-normal border-0 ${dtypeColor[col.dtype] || ""}`}
                  >
                    {col.dtype}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">空值率</span>
                    <NullRateBar pct={col.null_pct} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">唯一值</span>
                    <span className="tabular-nums">{col.unique_count.toLocaleString()}</span>
                  </div>
                  {col.avg_text_len != null && (
                    <div className="flex items-center justify-between col-span-2">
                      <span className="text-muted-foreground">平均文本长度</span>
                      <span className="tabular-nums">{col.avg_text_len}</span>
                    </div>
                  )}
                </div>
                {col.top_values.length > 0 && (
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground">高频值</span>
                    <div className="flex flex-wrap gap-1">
                      {col.top_values.slice(0, 3).map((tv) => (
                        <span
                          key={tv.value}
                          className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px]"
                        >
                          <span className="truncate max-w-[80px]">{tv.value}</span>
                          <span className="text-muted-foreground">({tv.count})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VersionsTab({
  datasetId,
  currentVersion,
  autoUpdate,
}: {
  datasetId: string;
  currentVersion: number;
  autoUpdate: boolean;
}) {
  const { data: versions, isLoading: versionsLoading } = useDatasetVersions(datasetId);
  const { data: syncLogs, isLoading: syncLogsLoading } = useSyncLogs(datasetId);

  return (
    <div className="space-y-4">
      {/* Versions list */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground">版本历史</h4>
        {versionsLoading ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            加载版本...
          </div>
        ) : !versions || versions.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            暂无版本记录
          </div>
        ) : (
          <div className="space-y-1.5">
            {[...versions]
              .sort((a: DatasetVersion, b: DatasetVersion) => b.version - a.version)
              .map((v: DatasetVersion) => {
                const isCurrent = v.version === currentVersion;
                return (
                  <div
                    key={v.id}
                    className={`rounded-md border px-2.5 py-2 space-y-1 ${
                      isCurrent
                        ? "border-primary/40 bg-primary/5"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">v{v.version}</span>
                        {isCurrent && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-normal">
                            当前
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {timeAgo(v.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="tabular-nums">
                        {v.row_count.toLocaleString()} 行
                      </span>
                      {v.size_bytes > 0 && (
                        <span className="tabular-nums">
                          {formatBytes(v.size_bytes)}
                        </span>
                      )}
                    </div>
                    {v.changelog && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {v.changelog}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Sync logs for subscribed datasets */}
      {autoUpdate && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">同步日志</h4>
          {syncLogsLoading ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              加载日志...
            </div>
          ) : !syncLogs || syncLogs.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              暂无同步记录
            </div>
          ) : (
            <div className="space-y-1.5">
              {[...syncLogs]
                .sort(
                  (a: SyncLog, b: SyncLog) =>
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                )
                .map((log: SyncLog) => {
                  const cfg = syncStatusConfig[log.status] || {
                    label: log.status,
                    className: "",
                  };
                  return (
                    <div
                      key={log.id}
                      className="rounded-md border px-2.5 py-2 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            className={`text-[10px] px-1 py-0 h-4 font-normal border-0 ${cfg.className}`}
                          >
                            {cfg.label}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {log.triggered_by === "manual" ? "手动" : "自动"}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {timeAgo(log.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        {log.new_version != null ? (
                          <span className="tabular-nums">
                            v{log.old_version} → v{log.new_version}
                          </span>
                        ) : (
                          <span className="tabular-nums">v{log.old_version}</span>
                        )}
                        {log.duration_ms > 0 && (
                          <span className="tabular-nums">
                            {log.duration_ms < 1000
                              ? `${log.duration_ms}ms`
                              : `${(log.duration_ms / 1000).toFixed(1)}s`}
                          </span>
                        )}
                      </div>
                      {log.error_message && (
                        <p className="text-[11px] text-destructive leading-relaxed break-all">
                          {log.error_message}
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main panel ────────────────────────────────────────────────── */

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

        <CardContent className="pt-0">
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="w-full h-8 p-0.5">
              <TabsTrigger value="info" className="flex-1 text-xs h-7">
                信息
              </TabsTrigger>
              <TabsTrigger value="stats" className="flex-1 text-xs h-7">
                统计
              </TabsTrigger>
              <TabsTrigger value="versions" className="flex-1 text-xs h-7">
                版本
              </TabsTrigger>
            </TabsList>

            {/* ── Info tab (existing content) ────────────────── */}
            <TabsContent value="info" className="space-y-4">
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
                  value={formatTime(dataset.created_at)}
                />
              </div>

              {/* Download banner for empty datasets */}
              {dataset.row_count === 0 &&
                (dataset.source_type === "preset" ||
                  dataset.source_type === "huggingface") && (
                  <div className="rounded-md bg-muted px-3 py-2.5 text-xs text-muted-foreground space-y-2">
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
                        className="h-6 text-[11px] px-2 text-muted-foreground"
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
                    <div className="space-y-1 text-[11px] text-muted-foreground">
                      <div className="flex items-baseline gap-1">
                        <span>状态：</span>
                        <span
                          className={
                            dataset.sync_status === "synced"
                              ? "text-emerald-600"
                              : dataset.sync_status === "syncing"
                                ? "text-primary"
                                : dataset.sync_status === "failed"
                                  ? "text-destructive"
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
                  className="text-destructive hover:text-destructive hover:bg-destructive/5"
                  onClick={() => onDelete({ id: dataset.id, name: dataset.name })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </TabsContent>

            {/* ── Stats tab ──────────────────────────────────── */}
            <TabsContent value="stats">
              <StatsTab datasetId={dataset.id} />
            </TabsContent>

            {/* ── Versions tab ───────────────────────────────── */}
            <TabsContent value="versions">
              <VersionsTab
                datasetId={dataset.id}
                currentVersion={dataset.version}
                autoUpdate={dataset.auto_update}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

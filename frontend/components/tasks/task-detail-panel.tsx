"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DetailRow } from "@/components/panel-helpers";
import {
  X,
  Loader2,
  Pause,
  Play,
  Ban,
  ExternalLink,
  Trash2,
  RotateCcw,
} from "lucide-react";
import {
  usePauseTask,
  useResumeTask,
  useCancelTask,
  useRestartTask,
} from "@/lib/hooks/use-tasks";
import type { EvalTask, Dataset, Criterion } from "@/lib/types";
import { utc } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import { statusLabel, statusBadgeVariant, formatDuration } from "./task-constants";

function parseParams(json: string) {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

interface TaskDetailPanelProps {
  task: EvalTask;
  datasets: Dataset[];
  criteria: Criterion[];
  onClose: () => void;
  onDelete: (target: { id: string; name: string }) => void;
  onViewDetail?: (id: string) => void;
}

export function TaskDetailPanel({
  task,
  datasets,
  criteria,
  onClose,
  onDelete,
  onViewDetail,
}: TaskDetailPanelProps) {
  const router = useRouter();
  const pauseTask = usePauseTask();
  const resumeTask = useResumeTask();
  const cancelTask = useCancelTask();
  const restartTask = useRestartTask();

  const params = parseParams(task.params_json);

  return (
    <div className="w-1/3 shrink-0">
      <Card className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-auto">
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          <h3 className="text-sm font-semibold truncate">{task.name}</h3>
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
            <DetailRow
              label="状态"
              value={
                <Badge
                  variant={statusBadgeVariant[task.status] ?? "outline"}
                  className="text-xs font-normal"
                >
                  {statusLabel[task.status] ?? task.status}
                </Badge>
              }
            />
            {task.total_prompts > 0 && (
              <DetailRow label="进度" value={
                <span className="font-mono tabular-nums">
                  {task.completed_prompts} / {task.total_prompts}
                  <span className="text-muted-foreground ml-1">
                    ({Math.round(task.completed_prompts / task.total_prompts * 100)}%)
                  </span>
                </span>
              } />
            )}
            {task.execution_backend && task.execution_backend !== "external_api" && (
              <DetailRow label="执行后端" value={
                task.execution_backend === "local_worker" ? "本地 Worker" : "K8s / vLLM"
              } />
            )}
            {task.worker_id && (
              <DetailRow label="Worker" value={
                <span className="font-mono text-[11px]">{task.worker_id}</span>
              } />
            )}
            {task.error_summary && (
              <div className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                {task.error_summary}
              </div>
            )}
            <DetailRow
              label="模型"
              value={task.model_name || task.model_id}
            />
            <DetailRow
              label="数据集"
              value={
                <div className="flex flex-wrap gap-1 justify-end">
                  {task.dataset_ids
                    .split(",")
                    .filter(Boolean)
                    .map((id) => {
                      const d = datasets.find((ds) => ds.id === id.trim());
                      return (
                        <Badge key={id} variant="outline" className="text-[10px]">
                          {d?.name ?? id.trim().slice(0, 8)}
                        </Badge>
                      );
                    })}
                </div>
              }
            />
            <DetailRow
              label="评测标准"
              value={
                <div className="flex flex-wrap gap-1 justify-end">
                  {task.criteria_ids
                    .split(",")
                    .filter(Boolean)
                    .map((id) => {
                      const c = criteria.find((cr) => cr.id === id.trim());
                      return (
                        <Badge key={id} variant="outline" className="text-[10px]">
                          {c?.name ?? id.trim().slice(0, 8)}
                        </Badge>
                      );
                    })}
                </div>
              }
            />
            <DetailRow
              label="重复次数"
              value={<span className="font-mono">{task.repeat_count}</span>}
            />
            <DetailRow
              label="种子策略"
              value={task.seed_strategy === "fixed" ? "固定" : "随机"}
            />
            {params.temperature !== undefined && (
              <DetailRow
                label="温度"
                value={<span className="font-mono">{params.temperature}</span>}
              />
            )}
            {params.max_tokens !== undefined && (
              <DetailRow
                label="最大 Token"
                value={
                  <span className="font-mono">
                    {params.max_tokens.toLocaleString()}
                  </span>
                }
              />
            )}
            <DetailRow
              label="创建时间"
              value={formatTime(task.created_at) ?? "\u2014"}
            />
            <DetailRow
              label="开始时间"
              value={formatTime(task.started_at) ?? "\u2014"}
            />
            <DetailRow
              label="结束时间"
              value={formatTime(task.finished_at) ?? "\u2014"}
            />
            <DetailRow
              label="耗时"
              value={
                <span className="font-mono">
                  {formatDuration(task.started_at, task.finished_at)}
                </span>
              }
            />
            {task.gpu_ids && (
              <DetailRow
                label="GPU"
                value={<span className="font-mono">{task.gpu_ids}</span>}
              />
            )}
          </div>

          {/* Action buttons */}
          {(task.status === "running" ||
            task.status === "paused" ||
            task.status === "failed" ||
            task.status === "cancelled" ||
            task.status === "pending") && (
            <div className="flex gap-2">
              {task.status === "running" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => pauseTask.mutate(task.id)}
                  disabled={pauseTask.isPending}
                >
                  {pauseTask.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Pause className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  暂停
                </Button>
              )}
              {task.status === "paused" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => resumeTask.mutate(task.id)}
                  disabled={resumeTask.isPending}
                >
                  {resumeTask.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  恢复
                </Button>
              )}
              {(task.status === "failed" || task.status === "cancelled") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => restartTask.mutate(task.id)}
                  disabled={restartTask.isPending}
                >
                  {restartTask.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  重启
                </Button>
              )}
              {(task.status === "running" || task.status === "pending") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/5"
                  onClick={() => cancelTask.mutate(task.id)}
                  disabled={cancelTask.isPending}
                >
                  {cancelTask.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Ban className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  取消
                </Button>
              )}
            </div>
          )}

          {/* View detail + delete */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() =>
                onViewDetail
                  ? onViewDetail(task.id)
                  : router.push(`/tasks/${task.id}`)
              }
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              查看详情
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive hover:bg-destructive/5"
              onClick={() => onDelete({ id: task.id, name: task.name })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

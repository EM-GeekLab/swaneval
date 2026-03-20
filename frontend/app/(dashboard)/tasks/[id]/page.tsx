"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { extractErrorDetail } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ArrowLeft, Pause, Play, XCircle, AlertTriangle, Trash2, BarChart3 } from "lucide-react";
import { useState } from "react";
import { utc } from "@/lib/utils";
import {
  useTask,
  useSubtasks,
  usePauseTask,
  useResumeTask,
  useCancelTask,
  useDeleteTask,
} from "@/lib/hooks/use-tasks";
import { useTaskSummary, useErrorResults } from "@/lib/hooks/use-results";
import { TableEmpty, TableLoading } from "@/components/table-states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const statusVariant = (
  s: string
): "default" | "secondary" | "destructive" | "outline" => {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    completed: "default",
    running: "secondary",
    failed: "destructive",
    pending: "outline",
    paused: "outline",
  };
  return map[s] || "outline";
};

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: task, isLoading } = useTask(id);
  const isRunning = task?.status === "running" || task?.status === "pending";
  const pollInterval = isRunning ? 3000 : false;
  const { data: subtasks = [] } = useSubtasks(id);
  const { data: summary = [] } = useTaskSummary(id, pollInterval);
  const { data: errorsData } = useErrorResults(id, 1, 50, pollInterval);
  const errors = errorsData?.items ?? [];
  const pause = usePauseTask();
  const resumeTask = useResumeTask();
  const cancel = useCancelTask();
  const deleteTask = useDeleteTask();
  const [showDelete, setShowDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // 1-second tick for live elapsed time display
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  if (isLoading || !task) {
    return (
      <div className="text-base-content/50 py-12 text-center">加载中...</div>
    );
  }

  const params = (() => {
    try {
      return JSON.parse(task.params_json);
    } catch {
      return {};
    }
  })();

  const chartData = summary.map((s) => ({
    name: s.criterion_name,
    score: s.avg_score,
    latency: s.avg_latency_ms,
  }));

  const barColors = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
  ];

  const failedSubtasks = subtasks.filter((st) => st.status === "failed");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push("/tasks")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{task.name}</h1>
          <p className="text-xs text-base-content/50">
            创建于 {utc(task.created_at)?.toLocaleString()}
          </p>
        </div>
        <Badge variant={statusVariant(task.status)} className="text-sm">
          {task.status}
        </Badge>
        {task.status === "running" && (
          <Button variant="outline" size="sm" onClick={() => pause.mutate(id)}>
            <Pause className="mr-1 h-3.5 w-3.5" /> 暂停
          </Button>
        )}
        {(task.status === "paused" || task.status === "failed") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => resumeTask.mutate(id)}
          >
            <Play className="mr-1 h-3.5 w-3.5" /> 恢复
          </Button>
        )}
        {(task.status === "running" || task.status === "pending") && (
          <Button
            variant="outline"
            size="sm"
            className="text-error"
            onClick={() => cancel.mutate(id)}
          >
            <XCircle className="mr-1 h-3.5 w-3.5" /> 取消
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="text-error hover:text-error hover:bg-error/5"
          onClick={() => setShowDelete(true)}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" /> 删除
        </Button>
      </div>

      {/* Failed task alert */}
      {task.status === "failed" && failedSubtasks.length > 0 && (
        <Card className="border-error/50 bg-error/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-error shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-medium text-error">
                  任务失败 — {failedSubtasks.length} 个子任务出错
                </p>
                {failedSubtasks.map((st) =>
                  st.error_log ? (
                    <p
                      key={st.id}
                      className="text-xs text-base-content/50 font-mono truncate"
                    >
                      运行 {st.run_index + 1}: {st.error_log}
                    </p>
                  ) : null
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Config summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "重复次数", value: task.repeat_count },
          { label: "种子策略", value: task.seed_strategy },
          { label: "温度", value: params.temperature ?? "-" },
          { label: "最大 Token 数", value: params.max_tokens ?? "-" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-3">
              <p className="text-xs text-base-content/50">{item.label}</p>
              <p className="text-sm font-medium">{String(item.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Subtasks progress */}
      {subtasks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">子任务</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {subtasks.map((st) => (
              <div
                key={st.id}
                className="grid items-center gap-3"
                style={{ gridTemplateColumns: "4rem 1fr 3rem 4.5rem" }}
              >
                <span className="text-xs text-base-content/50">
                  运行 {st.run_index + 1}
                </span>
                <Progress value={st.progress_pct} className="h-2" />
                <span className="text-xs font-mono text-right">
                  {st.progress_pct.toFixed(0)}%
                </span>
                <Badge variant={statusVariant(st.status)} className="justify-center">
                  {st.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={task.status === "failed" ? "errors" : "summary"}>
        <TabsList>
          <TabsTrigger value="summary">汇总</TabsTrigger>
          <TabsTrigger value="errors">
            错误{errors.length > 0 && ` (${errors.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4">
          {summary.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                {task.status === "running" || task.status === "pending" ? (
                  <TableLoading text="任务仍在运行中..." />
                ) : (
                  <TableEmpty icon={BarChart3} title="暂无结果" />
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Score chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    各评估标准平均得分
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={chartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 1]} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                        {chartData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={barColors[i % barColors.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Summary table */}
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>评估标准</TableHead>
                        <TableHead className="text-right">
                          平均分
                        </TableHead>
                        <TableHead className="text-right">最小</TableHead>
                        <TableHead className="text-right">最大</TableHead>
                        <TableHead className="text-right">数量</TableHead>
                        <TableHead className="text-right">
                          平均延迟
                        </TableHead>
                        <TableHead className="text-right">
                          平均 Token
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.map((s) => (
                        <TableRow key={s.criterion_id}>
                          <TableCell className="font-medium">
                            {s.criterion_name}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {s.avg_score.toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {s.min_score.toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {s.max_score.toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {s.count}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {s.avg_latency_ms.toFixed(0)}ms
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {s.avg_tokens.toFixed(0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="errors">
          <Card>
            <CardContent className="p-0">
              {errors.length === 0 ? (
                <TableEmpty title="未发现错误" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>输入提示</TableHead>
                      <TableHead>预期输出</TableHead>
                      <TableHead>模型输出</TableHead>
                      <TableHead className="text-right">得分</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {errors.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="max-w-[200px] truncate">
                          {r.prompt_text}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate font-mono text-xs">
                          {r.expected_output}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate font-mono text-xs">
                          {r.model_output}
                        </TableCell>
                        <TableCell className="text-right font-mono text-error">
                          {r.score.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete confirmation */}
      <Dialog open={showDelete} onOpenChange={() => { setShowDelete(false); setDeleteError(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除任务</DialogTitle>
            <DialogDescription>
              确定要删除 &quot;{task.name}&quot; 吗？相关的子任务和评测结果也将被删除，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-error px-1">{deleteError}</p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setShowDelete(false); setDeleteError(""); }}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setDeleteError("");
                try {
                  await deleteTask.mutateAsync(id);
                  router.push("/tasks");
                } catch (err: unknown) {
                  setDeleteError(extractErrorDetail(err, "删除失败"));
                }
              }}
              disabled={deleteTask.isPending}
            >
              {deleteTask.isPending ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

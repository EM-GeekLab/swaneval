"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Pause,
  Play,
  XCircle,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import {
  useTasks,
  useCreateTask,
  usePauseTask,
  useResumeTask,
  useCancelTask,
} from "@/lib/hooks/use-tasks";
import { useModels } from "@/lib/hooks/use-models";
import { useDatasets } from "@/lib/hooks/use-datasets";
import { useCriteria } from "@/lib/hooks/use-criteria";
import type { EvalTask } from "@/lib/types";

const statusVariant = (
  s: EvalTask["status"]
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

export default function TasksPage() {
  const router = useRouter();
  const { data: tasks = [], isLoading } = useTasks();
  const { data: models = [] } = useModels();
  const { data: datasets = [] } = useDatasets();
  const { data: criteria = [] } = useCriteria();
  const createTask = useCreateTask();
  const pause = usePauseTask();
  const resume = useResumeTask();
  const cancel = useCancelTask();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    model_id: "",
    dataset_ids: [] as string[],
    criteria_ids: [] as string[],
    temperature: "0.7",
    max_tokens: "1024",
    repeat_count: "1",
    seed_strategy: "fixed",
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createTask.mutateAsync({
      name: form.name,
      model_id: form.model_id,
      dataset_ids: form.dataset_ids,
      criteria_ids: form.criteria_ids,
      params_json: JSON.stringify({
        temperature: parseFloat(form.temperature),
        max_tokens: parseInt(form.max_tokens),
      }),
      repeat_count: parseInt(form.repeat_count),
      seed_strategy: form.seed_strategy,
    });
    setOpen(false);
  };

  const toggleDataset = (id: string) => {
    setForm((f) => ({
      ...f,
      dataset_ids: f.dataset_ids.includes(id)
        ? f.dataset_ids.filter((d) => d !== id)
        : [...f.dataset_ids, id],
    }));
  };

  const toggleCriterion = (id: string) => {
    setForm((f) => ({
      ...f,
      criteria_ids: f.criteria_ids.includes(id)
        ? f.criteria_ids.filter((c) => c !== id)
        : [...f.criteria_ids, id],
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">评测任务 Evaluations</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> New Task
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Create Evaluation Task</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1">
                <Label>Task Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-1">
                <Label>Model</Label>
                <Select
                  value={form.model_id}
                  onValueChange={(v) =>
                    setForm({ ...form, model_id: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} ({m.provider})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Datasets (click to select)</Label>
                <div className="flex flex-wrap gap-1.5 rounded border p-2 min-h-[2.5rem]">
                  {datasets.map((ds) => (
                    <button
                      key={ds.id}
                      type="button"
                      onClick={() => toggleDataset(ds.id)}
                      className={`rounded px-2 py-0.5 text-xs border transition-colors ${
                        form.dataset_ids.includes(ds.id)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted hover:bg-accent"
                      }`}
                    >
                      {ds.name}
                    </button>
                  ))}
                  {datasets.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      No datasets available
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label>Criteria (click to select)</Label>
                <div className="flex flex-wrap gap-1.5 rounded border p-2 min-h-[2.5rem]">
                  {criteria.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCriterion(c.id)}
                      className={`rounded px-2 py-0.5 text-xs border transition-colors ${
                        form.criteria_ids.includes(c.id)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted hover:bg-accent"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                  {criteria.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      No criteria available
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Temperature</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={form.temperature}
                    onChange={(e) =>
                      setForm({ ...form, temperature: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Max Tokens</Label>
                  <Input
                    type="number"
                    value={form.max_tokens}
                    onChange={(e) =>
                      setForm({ ...form, max_tokens: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Repeat Count</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.repeat_count}
                    onChange={(e) =>
                      setForm({ ...form, repeat_count: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Seed Strategy</Label>
                  <Select
                    value={form.seed_strategy}
                    onValueChange={(v) =>
                      setForm({ ...form, seed_strategy: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed</SelectItem>
                      <SelectItem value="random">Random</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={
                  createTask.isPending ||
                  !form.model_id ||
                  form.dataset_ids.length === 0 ||
                  form.criteria_ids.length === 0
                }
              >
                {createTask.isPending ? "Creating..." : "Create & Run"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Repeat</TableHead>
                <TableHead>Seed</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    Loading...
                  </TableCell>
                </TableRow>
              ) : tasks.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    No tasks.
                  </TableCell>
                </TableRow>
              ) : (
                tasks.map((t) => {
                  const duration =
                    t.started_at && t.finished_at
                      ? `${((new Date(t.finished_at).getTime() - new Date(t.started_at).getTime()) / 1000).toFixed(1)}s`
                      : t.started_at
                        ? "running..."
                        : "-";

                  return (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/tasks/${t.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{t.name}</span>
                          {t.status === "failed" && (
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(t.status)}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        {t.repeat_count}
                      </TableCell>
                      <TableCell>{t.seed_strategy}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(t.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono">{duration}</TableCell>
                      <TableCell className="text-right">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t.status === "running" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => pause.mutate(t.id)}
                            >
                              <Pause className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {(t.status === "paused" ||
                            t.status === "failed") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => resume.mutate(t.id)}
                            >
                              <Play className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {(t.status === "running" ||
                            t.status === "pending") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => cancel.mutate(t.id)}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

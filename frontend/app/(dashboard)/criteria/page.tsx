"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Plus, Trash2, FlaskConical, X } from "lucide-react";
import {
  useCriteria,
  useCreateCriterion,
  useDeleteCriterion,
  useTestCriterion,
} from "@/lib/hooks/use-criteria";

const typeColors: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  preset: "default",
  regex: "secondary",
  script: "outline",
  llm_judge: "default",
};

const typeDescriptions: Record<string, string> = {
  preset: "使用内置指标，如精确匹配、包含匹配或数值接近度。",
  regex: "使用正则表达式匹配模型输出。",
  script: "运行自定义脚本评估模型输出。",
  llm_judge: "使用另一个大语言模型评判响应质量。",
};

const presetMetrics = [
  {
    value: "exact_match",
    label: "精确匹配",
    desc: "输出必须与预期答案完全一致",
  },
  {
    value: "contains",
    label: "包含匹配",
    desc: "输出必须包含预期字符串",
  },
  {
    value: "numeric",
    label: "数值接近",
    desc: "在容差范围内比较数值",
  },
];

export default function CriteriaPage() {
  const { data: criteria = [], isLoading } = useCriteria();
  const create = useCreateCriterion();
  const deleteMut = useDeleteCriterion();
  const test = useTestCriterion();

  const [showForm, setShowForm] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testId, setTestId] = useState("");
  const [testForm, setTestForm] = useState({
    prompt: "",
    expected: "",
    actual: "",
  });
  const [testResult, setTestResult] = useState<{ score: number } | null>(null);

  const [form, setForm] = useState({
    name: "",
    type: "preset" as string,
    metric: "exact_match",
    pattern: "",
    script_path: "",
    entrypoint: "",
    judge_prompt: "",
  });

  const resetForm = () => {
    setForm({
      name: "",
      type: "preset",
      metric: "exact_match",
      pattern: "",
      script_path: "",
      entrypoint: "",
      judge_prompt: "",
    });
    setShowForm(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    let config: Record<string, unknown> = {};
    if (form.type === "preset") config = { metric: form.metric };
    else if (form.type === "regex")
      config = { pattern: form.pattern, match_mode: "contains" };
    else if (form.type === "script")
      config = {
        script_path: form.script_path,
        entrypoint: form.entrypoint,
      };
    else if (form.type === "llm_judge")
      config = { system_prompt: form.judge_prompt };

    await create.mutateAsync({
      name: form.name,
      type: form.type,
      config_json: JSON.stringify(config),
    });
    resetForm();
  };

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await test.mutateAsync({
      criterion_id: testId,
      ...testForm,
    });
    setTestResult(result);
  };

  const configSummary = (configJson: string, type: string) => {
    try {
      const cfg = JSON.parse(configJson);
      if (type === "preset") return cfg.metric;
      if (type === "regex") return cfg.pattern;
      if (type === "script") return cfg.script_path;
      if (type === "llm_judge") return "LLM Judge";
      return configJson;
    } catch {
      return configJson;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">评估标准</h1>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-4 w-4" /> 新建标准
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                创建评估标准
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={resetForm}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>名称</Label>
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    placeholder="例如：精确匹配、自定义正则"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>类型</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm({ ...form, type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preset">预设指标</SelectItem>
                      <SelectItem value="regex">正则表达式</SelectItem>
                      <SelectItem value="script">自定义脚本</SelectItem>
                      <SelectItem value="llm_judge">LLM 评判</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {typeDescriptions[form.type]}
              </p>

              {form.type === "preset" && (
                <div className="space-y-2">
                  <Label>指标</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {presetMetrics.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() =>
                          setForm({ ...form, metric: m.value })
                        }
                        className={`rounded-md border p-3 text-left transition-colors ${
                          form.metric === m.value
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:bg-muted"
                        }`}
                      >
                        <p className="text-sm font-medium">{m.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {m.desc}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {form.type === "regex" && (
                <div className="space-y-1">
                  <Label>正则表达式</Label>
                  <Input
                    value={form.pattern}
                    onChange={(e) =>
                      setForm({ ...form, pattern: e.target.value })
                    }
                    placeholder="例如 \\d+\\.?\\d*"
                    className="font-mono"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    标准正则语法，将对模型输出进行匹配。
                  </p>
                </div>
              )}

              {form.type === "script" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>脚本路径</Label>
                    <Input
                      value={form.script_path}
                      onChange={(e) =>
                        setForm({ ...form, script_path: e.target.value })
                      }
                      placeholder="/path/to/eval_script.py"
                      className="font-mono"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>入口函数</Label>
                    <Input
                      value={form.entrypoint}
                      onChange={(e) =>
                        setForm({ ...form, entrypoint: e.target.value })
                      }
                      placeholder="evaluate"
                      className="font-mono"
                      required
                    />
                  </div>
                </div>
              )}

              {form.type === "llm_judge" && (
                <div className="space-y-1">
                  <Label>系统提示词</Label>
                  <textarea
                    value={form.judge_prompt}
                    onChange={(e) =>
                      setForm({ ...form, judge_prompt: e.target.value })
                    }
                    placeholder="你是一个评估专家。请根据以下标准对回答打分（0-1）..."
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    required
                  />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  取消
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "创建中..." : "创建标准"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>配置</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    加载中...
                  </TableCell>
                </TableRow>
              ) : criteria.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    暂无评估标准。{" "}
                    {!showForm && (
                      <button
                        className="text-primary underline"
                        onClick={() => setShowForm(true)}
                      >
                        创建一个
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                criteria.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant={typeColors[c.type] ?? "default"}>
                        {c.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-xs truncate">
                      {configSummary(c.config_json, c.type)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setTestId(c.id);
                          setTestResult(null);
                          setTestForm({
                            prompt: "",
                            expected: "",
                            actual: "",
                          });
                          setTestOpen(true);
                        }}
                      >
                        <FlaskConical className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deleteMut.mutate(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
            <Button
              type="submit"
              className="w-full"
              disabled={test.isPending}
            >
              {test.isPending ? "测试中..." : "运行测试"}
            </Button>
            {testResult !== null && (
              <div className="rounded bg-muted p-3 text-center">
                <span className="text-xs text-muted-foreground">得分：</span>
                <span
                  className={`text-lg font-bold ${
                    testResult.score >= 1
                      ? "text-emerald-600"
                      : "text-destructive"
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

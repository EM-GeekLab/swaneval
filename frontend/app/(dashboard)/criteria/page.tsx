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
  preset: "Use a built-in metric like Exact Match, Contains, or Numeric Closeness.",
  regex: "Match model output against a regular expression pattern.",
  script: "Run a custom script to evaluate model output.",
  llm_judge: "Use another LLM model to judge the quality of responses.",
};

const presetMetrics = [
  { value: "exact_match", label: "Exact Match", desc: "Output must exactly match expected answer" },
  { value: "contains", label: "Contains", desc: "Output must contain the expected string" },
  { value: "numeric", label: "Numeric Closeness", desc: "Compare numeric values with tolerance" },
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
      config = { script_path: form.script_path, entrypoint: form.entrypoint };
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
        <h1 className="text-lg font-semibold">Evaluation Criteria</h1>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-4 w-4" /> New Criterion
          </Button>
        )}
      </div>

      {/* Inline creation form */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Create Criterion
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
              {/* Row 1: Name + Type side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    placeholder="e.g. Exact Match, Custom Regex"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm({ ...form, type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preset">Preset Metric</SelectItem>
                      <SelectItem value="regex">Regex</SelectItem>
                      <SelectItem value="script">Script</SelectItem>
                      <SelectItem value="llm_judge">LLM Judge</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Type description */}
              <p className="text-xs text-muted-foreground">
                {typeDescriptions[form.type]}
              </p>

              {/* Type-specific config */}
              {form.type === "preset" && (
                <div className="space-y-2">
                  <Label>Metric</Label>
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
                  <Label>Pattern</Label>
                  <Input
                    value={form.pattern}
                    onChange={(e) =>
                      setForm({ ...form, pattern: e.target.value })
                    }
                    placeholder="e.g. \\d+\\.?\\d*"
                    className="font-mono"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Standard regex syntax. The pattern will be tested against
                    model output.
                  </p>
                </div>
              )}

              {form.type === "script" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Script Path</Label>
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
                    <Label>Entrypoint</Label>
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
                  <Label>System Prompt</Label>
                  <textarea
                    value={form.judge_prompt}
                    onChange={(e) =>
                      setForm({ ...form, judge_prompt: e.target.value })
                    }
                    placeholder="You are an evaluation judge. Score the response from 0 to 1 based on..."
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    required
                  />
                </div>
              )}

              {/* Submit */}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Creating..." : "Create Criterion"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Criteria table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Config</TableHead>
                <TableHead>Created</TableHead>
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
                    Loading...
                  </TableCell>
                </TableRow>
              ) : criteria.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    No criteria defined.{" "}
                    {!showForm && (
                      <button
                        className="text-primary underline"
                        onClick={() => setShowForm(true)}
                      >
                        Create one
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

      {/* Test Dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Test Criterion</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleTest} className="space-y-3">
            <div className="space-y-1">
              <Label>Prompt</Label>
              <Input
                value={testForm.prompt}
                onChange={(e) =>
                  setTestForm({ ...testForm, prompt: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Expected Output</Label>
              <Input
                value={testForm.expected}
                onChange={(e) =>
                  setTestForm({ ...testForm, expected: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Actual Output</Label>
              <Input
                value={testForm.actual}
                onChange={(e) =>
                  setTestForm({ ...testForm, actual: e.target.value })
                }
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={test.isPending}>
              {test.isPending ? "Testing..." : "Run Test"}
            </Button>
            {testResult !== null && (
              <div className="rounded bg-muted p-3 text-center">
                <span className="text-xs text-muted-foreground">Score: </span>
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

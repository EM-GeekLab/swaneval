"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PanelField, DetailRow } from "@/components/panel-helpers";
import { Stepper } from "@/components/ui/stepper";
import { JsonImportBar } from "@/components/json-import-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Code2,
  Shuffle,
  AlertCircle,
} from "lucide-react";
import { useModels } from "@/lib/hooks/use-models";
import { useDatasets, useDatasetPreview } from "@/lib/hooks/use-datasets";
import { useCriteria } from "@/lib/hooks/use-criteria";
import { useCreateTask } from "@/lib/hooks/use-tasks";

const STEPS = [
  { title: "选择模型" },
  { title: "数据集与评测标准" },
  { title: "参数配置" },
  { title: "运行环境" },
  { title: "确认提交" },
];

const emptyForm = {
  name: "",
  model_id: "",
  dataset_ids: [] as string[],
  criteria_ids: [] as string[],
  temperature: "0.7",
  max_tokens: "2048",
  limit: "",
  repeat_count: "1",
  seed_strategy: "fixed",
  gpu_ids: "",
  env_vars: "",
  execution_backend: "external_api",
  field_mappings: {} as Record<string, { prompt_field: string; expected_field: string }>,
};

interface TaskCreateWizardProps {
  onSuccess: () => void;
  onClose: () => void;
}

const PROMPT_FIELDS = ["prompt", "instruction", "query", "input", "question", "text", "content"];
const EXPECTED_FIELDS = ["expected", "response", "output", "answer", "target", "label"];

function autoDetectField(columns: string[], candidates: string[]): string {
  for (const c of candidates) {
    const match = columns.find((col) => col.toLowerCase() === c);
    if (match) return match;
  }
  return "";
}

export function TaskCreateWizard({ onSuccess }: TaskCreateWizardProps) {
  const { data: models = [] } = useModels();
  const { data: datasetsData } = useDatasets();
  const datasets = useMemo(() => datasetsData?.items ?? [], [datasetsData]);
  const { data: criteria = [] } = useCriteria();
  const createTask = useCreateTask();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ ...emptyForm, dataset_ids: [] as string[], criteria_ids: [] as string[] });
  const [showConfigPreview, setShowConfigPreview] = useState(false);
  const [importError, setImportError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selectedModelName =
    models.find((m) => m.id === form.model_id)?.name ?? "";

  const updateFieldMapping = (
    dsId: string, field: "prompt_field" | "expected_field", value: string,
  ) => {
    setForm((f) => ({
      ...f,
      field_mappings: {
        ...f.field_mappings,
        [dsId]: { ...f.field_mappings[dsId], [field]: value },
      },
    }));
  };

  const canNext = () => {
    if (step === 0) return !!form.model_id;
    if (step === 1) {
      if (form.dataset_ids.length === 0 || form.criteria_ids.length === 0) return false;
      // Every dataset must have a prompt_field mapped
      return form.dataset_ids.every(
        (id) => !!form.field_mappings[id]?.prompt_field,
      );
    }
    if (step === 2) return !!form.name;
    if (step === 3) return true;
    return true;
  };

  const handleSubmit = async () => {
    const paramsObj: Record<string, unknown> = {
      temperature: parseFloat(form.temperature),
      max_tokens: parseInt(form.max_tokens),
    };
    if (form.limit) paramsObj.limit = parseInt(form.limit);
    if (Object.keys(form.field_mappings).length > 0) {
      paramsObj.field_mappings = form.field_mappings;
    }
    await createTask.mutateAsync({
      name: form.name,
      model_id: form.model_id,
      dataset_ids: form.dataset_ids,
      criteria_ids: form.criteria_ids,
      params_json: JSON.stringify(paramsObj),
      repeat_count: parseInt(form.repeat_count),
      seed_strategy: form.seed_strategy,
      gpu_ids: form.gpu_ids || undefined,
      env_vars: form.env_vars || undefined,
      execution_backend: form.execution_backend,
    });
    onSuccess();
  };

  return (
    <>
      {/* JSON import bar */}
      <JsonImportBar
        onImport={(text) => {
          const data = JSON.parse(text); // safe: JsonImportBar validates JSON
          let params: Record<string, unknown> = {};
          if (typeof data.params_json === "string") {
            try {
              params = JSON.parse(data.params_json);
            } catch {
              setImportError("params_json 字段 JSON 格式错误，已忽略该字段");
              setTimeout(() => setImportError(""), 4000);
            }
          } else if (typeof data.params_json === "object" && data.params_json) {
            params = data.params_json;
          }
          const toArr = (v: unknown): string[] => {
            if (Array.isArray(v)) return v;
            if (typeof v === "string" && v) return v.split(",").map((s: string) => s.trim()).filter(Boolean);
            return [];
          };
          setForm((f) => ({
            ...f,
            name: "",
            model_id: data.model_id ?? f.model_id,
            dataset_ids: toArr(data.dataset_ids).length > 0 ? toArr(data.dataset_ids) : f.dataset_ids,
            criteria_ids: toArr(data.criteria_ids).length > 0 ? toArr(data.criteria_ids) : f.criteria_ids,
            temperature: String(data.temperature ?? params.temperature ?? f.temperature),
            max_tokens: String(data.max_tokens ?? params.max_tokens ?? f.max_tokens),
            limit: String(data.limit ?? params.limit ?? f.limit),
            repeat_count: String(data.repeat_count ?? f.repeat_count),
            seed_strategy: data.seed_strategy ?? f.seed_strategy,
            gpu_ids: data.gpu_ids ?? f.gpu_ids,
            env_vars: typeof data.env_vars === "object" ? JSON.stringify(data.env_vars, null, 2) : data.env_vars ?? f.env_vars,
          }));
          setStep(2);
          setTimeout(() => nameInputRef.current?.focus(), 100);
        }}
        className="mb-2"
      />
      {importError && (
        <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive mb-2">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {importError}
        </div>
      )}

      {/* Stepper indicator */}
      <Stepper
        steps={STEPS}
        activeStep={step}
        onStepClick={(i) => setStep(i)}
        className="pb-4 pt-2"
      />

      <div className="space-y-3">
        {/* Step 0: Select model */}
        {step === 0 && (
          <PanelField label="选择模型" required>
            <Select
              value={form.model_id}
              onValueChange={(v) =>
                setForm({ ...form, model_id: v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="选择一个模型" />
              </SelectTrigger>
              <SelectContent>
                {models.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    暂无模型，<a href="/models" className="text-primary hover:underline">去添加</a>
                  </div>
                ) : models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {models.length === 0 && (
              <p className="text-xs text-muted-foreground">
                暂无已注册模型，请先在模型页面添加。
              </p>
            )}
          </PanelField>
        )}

        {/* Step 1: Select datasets + criteria */}
        {step === 1 && (
          <>
            <PanelField label="选择数据集" required>
              <div className="flex flex-wrap gap-1.5">
                {datasets.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      const ids = form.dataset_ids.includes(d.id)
                        ? form.dataset_ids.filter(
                            (id) => id !== d.id,
                          )
                        : [...form.dataset_ids, d.id];
                      setForm({ ...form, dataset_ids: ids });
                    }}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      form.dataset_ids.includes(d.id)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {d.name}
                  </button>
                ))}
                {datasets.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    暂无数据集
                  </span>
                )}
              </div>
            </PanelField>

            {/* Per-dataset field mapping */}
            {form.dataset_ids.length > 0 && (
              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">字段映射</p>
                {form.dataset_ids.map((dsId) => {
                  const ds = datasets.find((d) => d.id === dsId);
                  const mapping = form.field_mappings[dsId] ?? { prompt_field: "", expected_field: "" };
                  return (
                    <DatasetFieldMapping
                      key={dsId}
                      datasetId={dsId}
                      datasetName={ds?.name ?? dsId}
                      promptField={mapping.prompt_field}
                      expectedField={mapping.expected_field}
                      onPromptChange={(v) => updateFieldMapping(dsId, "prompt_field", v)}
                      onExpectedChange={(v) => updateFieldMapping(dsId, "expected_field", v)}
                    />
                  );
                })}
                <p className="text-[10px] text-muted-foreground">
                  每个数据集可独立配置字段映射。已自动检测，可手动修改。
                </p>
              </div>
            )}

            <PanelField label="选择评测标准" required>
              <div className="flex flex-wrap gap-1.5">
                {criteria.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      const ids = form.criteria_ids.includes(c.id)
                        ? form.criteria_ids.filter(
                            (id) => id !== c.id,
                          )
                        : [...form.criteria_ids, c.id];
                      setForm({ ...form, criteria_ids: ids });
                    }}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      form.criteria_ids.includes(c.id)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
                {criteria.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    暂无评测标准
                  </span>
                )}
              </div>
            </PanelField>
          </>
        )}

        {/* Step 2: Params */}
        {step === 2 && (
          <>
            <PanelField label="任务名称" required>
              <div className="flex gap-2">
                <Input
                  ref={nameInputRef}
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                  placeholder="评测任务名称"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  title="生成随机名称"
                  onClick={() => {
                    const id = crypto.randomUUID().slice(0, 8);
                    const model = models.find((m) => m.id === form.model_id);
                    const prefix = model ? model.name.slice(0, 10) : "task";
                    setForm({ ...form, name: `${prefix}-${id}` });
                  }}
                >
                  <Shuffle className="h-4 w-4" />
                </Button>
              </div>
            </PanelField>
            <div className="grid grid-cols-2 gap-2">
              <PanelField label="温度">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={form.temperature}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      temperature: e.target.value,
                    })
                  }
                />
              </PanelField>
              <PanelField label="最大 Token">
                <Input
                  type="number"
                  value={form.max_tokens}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      max_tokens: e.target.value,
                    })
                  }
                />
              </PanelField>
            </div>
            <PanelField label="数据量限制">
              <Input
                type="number"
                value={form.limit}
                onChange={(e) =>
                  setForm({ ...form, limit: e.target.value })
                }
                placeholder="不限制"
              />
            </PanelField>
            <div className="grid grid-cols-2 gap-2">
              <PanelField label="重复次数">
                <Input
                  type="number"
                  min="1"
                  value={form.repeat_count}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      repeat_count: e.target.value,
                    })
                  }
                />
              </PanelField>
              <PanelField label="种子策略">
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
                    <SelectItem value="fixed">固定</SelectItem>
                    <SelectItem value="random">随机</SelectItem>
                  </SelectContent>
                </Select>
              </PanelField>
            </div>
          </>
        )}

        {/* Step 3: Hardware & Environment */}
        {step === 3 && (
          <>
            <PanelField label="执行后端">
              <Select
                value={form.execution_backend}
                onValueChange={(v) => setForm({ ...form, execution_backend: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="external_api">外部 API</SelectItem>
                  <SelectItem value="local_worker">本地 Worker</SelectItem>
                  <SelectItem value="k8s_vllm">K8s / vLLM</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                选择任务执行方式：外部 API 直接调用模型接口，本地 Worker 在 GPU 服务器运行，K8s/vLLM 在集群部署
              </p>
            </PanelField>
            <PanelField label="GPU 编号">
              <Input
                value={form.gpu_ids}
                onChange={(e) =>
                  setForm({ ...form, gpu_ids: e.target.value })
                }
                placeholder="例：0 或 0,1,2"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                指定 CUDA_VISIBLE_DEVICES，留空使用所有可用 GPU
              </p>
            </PanelField>
            <PanelField label="环境变量 (JSON)">
              <textarea
                value={form.env_vars}
                onChange={(e) =>
                  setForm({ ...form, env_vars: e.target.value })
                }
                placeholder={'{\n  "OMP_NUM_THREADS": "4"\n}'}
                className="flex min-h-[80px] w-full rounded-md border border-border bg-muted px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                可选。JSON 格式的环境变量，将在任务运行时注入
              </p>
            </PanelField>
            <div className="rounded-md bg-muted p-2.5 text-[11px] text-muted-foreground space-y-1">
              <p className="font-medium text-foreground/70 text-xs">常用环境变量</p>
              <p><code className="font-mono">CUDA_VISIBLE_DEVICES</code> — 指定 GPU（由上方 GPU 编号自动设置）</p>
              <p><code className="font-mono">OMP_NUM_THREADS</code> — OpenMP 线程数</p>
              <p><code className="font-mono">TOKENIZERS_PARALLELISM</code> — HuggingFace 分词器并行</p>
            </div>
          </>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <>
            <div className="space-y-2.5">
              <DetailRow label="任务名称" value={form.name} />
              <DetailRow label="模型" value={selectedModelName} />
              <DetailRow
                label="数据集"
                value={
                  <div className="flex flex-wrap gap-1 justify-end">
                    {form.dataset_ids.map((id) => {
                      const d = datasets.find(
                        (ds) => ds.id === id,
                      );
                      return (
                        <Badge
                          key={id}
                          variant="outline"
                          className="text-[10px]"
                        >
                          {d?.name ?? id}
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
                    {form.criteria_ids.map((id) => {
                      const c = criteria.find(
                        (cr) => cr.id === id,
                      );
                      return (
                        <Badge
                          key={id}
                          variant="outline"
                          className="text-[10px]"
                        >
                          {c?.name ?? id}
                        </Badge>
                      );
                    })}
                  </div>
                }
              />
              <DetailRow
                label="温度"
                value={form.temperature}
              />
              <DetailRow
                label="最大 Token"
                value={form.max_tokens}
              />
              {form.limit && (
                <DetailRow label="数据量限制" value={form.limit} />
              )}
              <DetailRow
                label="重复次数"
                value={form.repeat_count}
              />
              <DetailRow
                label="种子策略"
                value={
                  form.seed_strategy === "fixed" ? "固定" : "随机"
                }
              />
              {form.gpu_ids && (
                <DetailRow
                  label="GPU"
                  value={<span className="font-mono">{form.gpu_ids}</span>}
                />
              )}
              {form.env_vars && (
                <DetailRow
                  label="环境变量"
                  value={<span className="font-mono text-[11px]">已配置</span>}
                />
              )}
              <DetailRow label="执行后端" value={
                form.execution_backend === "external_api" ? "外部 API" :
                form.execution_backend === "local_worker" ? "本地 Worker" : "K8s / vLLM"
              } />
            </div>

            {/* Config JSON preview toggle */}
            <button
              type="button"
              onClick={() =>
                setShowConfigPreview(!showConfigPreview)
              }
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Code2 className="h-3 w-3" />
              {showConfigPreview ? "隐藏" : "查看"} JSON 配置
            </button>
            {showConfigPreview && (
              <pre className="text-[11px] bg-muted rounded-md p-3 overflow-auto max-h-40 font-mono">
                {JSON.stringify(
                  {
                    name: form.name,
                    model_id: form.model_id,
                    dataset_ids: form.dataset_ids,
                    criteria_ids: form.criteria_ids,
                    params_json: {
                      temperature: parseFloat(form.temperature),
                      max_tokens: parseInt(form.max_tokens),
                      ...(form.limit
                        ? { limit: parseInt(form.limit) }
                        : {}),
                    },
                    repeat_count: parseInt(form.repeat_count),
                    seed_strategy: form.seed_strategy,
                    ...(form.gpu_ids ? { gpu_ids: form.gpu_ids } : {}),
                    ...(form.env_vars ? { env_vars: form.env_vars } : {}),
                  },
                  null,
                  2,
                )}
              </pre>
            )}
          </>
        )}

        {/* Navigation */}
        <div className="flex gap-2 pt-1">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setStep(step - 1)}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />
              上一步
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              size="sm"
              className="flex-1"
              disabled={!canNext()}
              onClick={() => setStep(step + 1)}
            >
              下一步
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="flex-1"
              disabled={createTask.isPending}
              onClick={handleSubmit}
            >
              {createTask.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {createTask.isPending ? "提交中..." : "提交任务"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

/** Per-dataset field mapping with auto-detection */
function DatasetFieldMapping({
  datasetId,
  datasetName,
  promptField,
  expectedField,
  onPromptChange,
  onExpectedChange,
}: {
  datasetId: string;
  datasetName: string;
  promptField: string;
  expectedField: string;
  onPromptChange: (v: string) => void;
  onExpectedChange: (v: string) => void;
}) {
  const { data: preview } = useDatasetPreview(datasetId, true);
  const columns = useMemo(() => {
    if (!preview?.rows?.length) return [];
    return Object.keys(preview.rows[0]);
  }, [preview]);

  // Auto-detect on first load
  useEffect(() => {
    if (columns.length === 0) return;
    if (!promptField) {
      onPromptChange(autoDetectField(columns, PROMPT_FIELDS));
    }
    if (!expectedField) {
      onExpectedChange(autoDetectField(columns, EXPECTED_FIELDS));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  const promptMissing = columns.length > 0 && !promptField;

  if (columns.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {datasetName}: 加载字段中...
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium truncate">{datasetName}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">输入 (Prompt)</span>
            <span className="text-[10px] text-destructive">*</span>
          </div>
          <Select value={promptField} onValueChange={onPromptChange}>
            <SelectTrigger className={`h-7 text-[11px] font-mono ${promptMissing ? "border-destructive" : ""}`}>
              <SelectValue placeholder="请选择" />
            </SelectTrigger>
            <SelectContent>
              {columns.map((col) => (
                <SelectItem key={col} value={col}>
                  <span className="font-mono text-xs">{col}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {promptMissing && (
            <p className="text-[9px] text-destructive">必须选择输入字段</p>
          )}
        </div>
        <div className="space-y-0.5">
          <span className="text-[10px] text-muted-foreground">预期输出 (Expected)</span>
          <Select
            value={expectedField || "__none__"}
            onValueChange={(v) => onExpectedChange(v === "__none__" ? "" : v)}
          >
            <SelectTrigger className="h-7 text-[11px] font-mono">
              <SelectValue placeholder="可选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                <span className="text-muted-foreground text-xs">无 (仅生成)</span>
              </SelectItem>
              {columns.map((col) => (
                <SelectItem key={col} value={col}>
                  <span className="font-mono text-xs">{col}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

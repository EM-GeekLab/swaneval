"use client";

import { useState } from "react";
import { JsonImportBar } from "@/components/json-import-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PanelField } from "@/components/panel-helpers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { useCreateCriterion } from "@/lib/hooks/use-criteria";
import { useModels } from "@/lib/hooks/use-models";

const typeDescriptions: Record<string, string> = {
  preset: "使用内置指标，如精确匹配、包含匹配或数值接近度。",
  regex: "使用正则表达式匹配模型输出。",
  sandbox: "在安全沙箱中执行代码并验证结果。支持 Pass@k 代码评测和自定义评估脚本。",
  llm_judge: "使用另一个大语言模型评判响应质量。",
};

const presetMetrics = [
  {
    value: "exact_match",
    label: "精确匹配",
    desc: "输出必须与预期答案完全一致",
  },
  { value: "contains", label: "包含匹配", desc: "输出必须包含预期字符串" },
  { value: "numeric", label: "数值接近", desc: "在容差范围内比较数值" },
];

const emptyForm = {
  name: "",
  type: "preset",
  metric: "exact_match",
  pattern: "",
  sandbox_mode: "pass_at_k",
  sandbox_timeout: "10",
  sandbox_script_path: "",
  sandbox_entrypoint: "evaluate",
  judge_prompt: "",
  judge_model_id: "",
};

interface CriterionCreateFormProps {
  onSuccess: () => void;
  onClose: () => void;
}

export function CriterionCreateForm({ onSuccess, onClose: _onClose }: CriterionCreateFormProps) {
  void _onClose;
  const create = useCreateCriterion();
  const { data: models = [] } = useModels();

  const [form, setForm] = useState({ ...emptyForm });

  const importCriterionJson = (text: string) => {
    try {
      const data = JSON.parse(text);
      const cfg = data.config_json
        ? typeof data.config_json === "string"
          ? JSON.parse(data.config_json)
          : data.config_json
        : {};
      setForm((f) => ({
        ...f,
        name: data.name ?? f.name,
        type: data.type ?? f.type,
        metric: cfg.metric ?? f.metric,
        pattern: cfg.pattern ?? f.pattern,
        sandbox_mode: cfg.mode ?? f.sandbox_mode,
        sandbox_timeout: String(cfg.timeout ?? f.sandbox_timeout),
        sandbox_script_path: cfg.script_path ?? f.sandbox_script_path,
        sandbox_entrypoint: cfg.entrypoint ?? f.sandbox_entrypoint,
        judge_prompt: cfg.system_prompt ?? f.judge_prompt,
        judge_model_id: cfg.judge_model_id ?? f.judge_model_id,
      }));
    } catch {
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    let config: Record<string, unknown> = {};
    if (form.type === "preset") config = { metric: form.metric };
    else if (form.type === "regex")
      config = { pattern: form.pattern, match_mode: "contains" };
    else if (form.type === "sandbox") {
      config = {
        mode: form.sandbox_mode,
        timeout: parseInt(form.sandbox_timeout) || 10,
      };
      if (form.sandbox_mode === "custom_script") {
        config.script_path = form.sandbox_script_path;
        config.entrypoint = form.sandbox_entrypoint || "evaluate";
      }
    }
    else if (form.type === "llm_judge")
      config = {
        system_prompt: form.judge_prompt,
        ...(form.judge_model_id ? { judge_model_id: form.judge_model_id } : {}),
      };

    await create.mutateAsync({
      name: form.name,
      type: form.type,
      config_json: JSON.stringify(config),
    });
    onSuccess();
  };

  return (
    <>
      <JsonImportBar onImport={importCriterionJson} className="mb-3" />

      <form onSubmit={handleCreate} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <PanelField label="名称" required>
            <Input
              value={form.name}
              onChange={(e) =>
                setForm({ ...form, name: e.target.value })
              }
              placeholder="精确匹配"
              required
            />
          </PanelField>
          <PanelField label="类型">
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
                <SelectItem value="sandbox">沙箱执行</SelectItem>
                <SelectItem value="llm_judge">LLM 评判</SelectItem>
              </SelectContent>
            </Select>
          </PanelField>
        </div>

        <p className="text-xs text-muted-foreground">
          {typeDescriptions[form.type]}
        </p>

        {form.type === "preset" && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              指标
            </Label>
            <div className="space-y-1.5">
              {presetMetrics.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() =>
                    setForm({ ...form, metric: m.value })
                  }
                  className={`w-full rounded-md border p-2.5 text-left transition-colors ${
                    form.metric === m.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {form.type === "regex" && (
          <PanelField label="正则表达式" required>
            <RegexInput
              value={form.pattern}
              onChange={(v) =>
                setForm({ ...form, pattern: v })
              }
              placeholder="\\d+\\.?\\d*"
            />
          </PanelField>
        )}

        {form.type === "sandbox" && (
          <>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">执行模式</Label>
              <div className="space-y-1.5">
                {[
                  { value: "pass_at_k", label: "Pass@k 代码评测", desc: "将模型生成的代码与测试用例组合执行" },
                  { value: "custom_script", label: "自定义评估脚本", desc: "运行服务器上的 Python 脚本评估输出" },
                ].map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setForm({ ...form, sandbox_mode: m.value })}
                    className={`w-full rounded-md border p-2.5 text-left transition-colors ${
                      form.sandbox_mode === m.value
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <PanelField label="超时时间 (秒)">
              <Input
                type="number"
                value={form.sandbox_timeout}
                onChange={(e) => setForm({ ...form, sandbox_timeout: e.target.value })}
                placeholder="10"
                className="font-mono"
              />
            </PanelField>
            {form.sandbox_mode === "custom_script" && (
              <>
                <PanelField label="脚本路径" required>
                  <Input
                    value={form.sandbox_script_path}
                    onChange={(e) => setForm({ ...form, sandbox_script_path: e.target.value })}
                    placeholder="/path/to/eval_script.py"
                    className="font-mono"
                    required
                  />
                </PanelField>
                <PanelField label="入口函数">
                  <Input
                    value={form.sandbox_entrypoint}
                    onChange={(e) => setForm({ ...form, sandbox_entrypoint: e.target.value })}
                    placeholder="evaluate"
                    className="font-mono"
                  />
                </PanelField>
              </>
            )}
            {form.sandbox_mode === "pass_at_k" && (
              <div className="rounded-md bg-muted p-2.5 text-[11px] font-mono text-muted-foreground space-y-0.5">
                <p className="text-foreground/70 font-sans text-xs font-medium mb-1">执行流程</p>
                <p>1. 模型生成的代码写入 solution.py</p>
                <p>2. 预期输出中的测试断言追加到末尾</p>
                <p>3. 在沙箱子进程中执行</p>
                <p>4. 退出码 0 = 通过 (1.0)，否则 = 失败 (0.0)</p>
              </div>
            )}
          </>
        )}

        {form.type === "llm_judge" && (
          <>
            <PanelField label="评判模型" required>
              <Select
                value={form.judge_model_id}
                onValueChange={(v) =>
                  setForm({ ...form, judge_model_id: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择用于评判的模型" />
                </SelectTrigger>
                <SelectContent>
                  {models.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                      暂无模型，<a href="/models" className="text-primary hover:underline">去添加</a>
                    </div>
                  ) : models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                      {m.model_name && (
                        <span className="text-muted-foreground ml-1">
                          ({m.model_name})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {models.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  请先在模型页面添加一个模型。
                </p>
              )}
            </PanelField>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">提示词模板</p>
              <div className="space-y-1">
                {[
                  { label: "通用评判", prompt: "你是一个严格的评估专家。请根据预期答案与实际输出的匹配程度，给出 0 到 1 之间的评分。只返回一个数字。" },
                  { label: "ELO 对比评判", prompt: "你是一个公正的评委。请比较以下两段回答的质量。优于预期返回 0.7-1.0，相当返回 0.4-0.6，较差返回 0.0-0.3。只返回一个数字。" },
                  { label: "流畅度评估", prompt: "你是一个语言模型专家。请评估以下文本的流畅度和连贯性。1.0 表示完美流畅，0.0 表示完全不连贯。只返回一个 0-1 的数字。" },
                ].map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setForm({ ...form, judge_prompt: t.prompt })}
                    className={`w-full rounded-md border px-2.5 py-1.5 text-left transition-colors text-xs ${
                      form.judge_prompt === t.prompt
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <PanelField label="系统提示词" required>
              <textarea
                value={form.judge_prompt}
                onChange={(e) =>
                  setForm({
                    ...form,
                    judge_prompt: e.target.value,
                  })
                }
                placeholder="你是一个评估专家。请根据以下标准对回答打分（0-1）..."
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                required
              />
            </PanelField>
          </>
        )}

        <div className="pt-1">
          <Button
            type="submit"
            className="w-full"
            disabled={create.isPending}
          >
            {create.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            {create.isPending ? "创建中..." : "创建标准"}
          </Button>
        </div>
      </form>
    </>
  );
}


/* ── Sub-components ── */

/* Tokenize a regex string into colored spans */
function highlightRegex(pattern: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];

    // Escape sequences: \d, \w, \s, \., etc.
    if (ch === "\\" && i + 1 < pattern.length) {
      const esc = pattern[i + 1];
      const isShorthand = "dwsDbBWS".includes(esc);
      tokens.push(
        <span key={i} className={isShorthand ? "text-amber-500" : "text-sky-500"}>
          {ch}{esc}
        </span>,
      );
      i += 2;
      continue;
    }

    // Character classes: [...]
    if (ch === "[") {
      let end = i + 1;
      if (end < pattern.length && pattern[end] === "^") end++;
      if (end < pattern.length && pattern[end] === "]") end++;
      while (end < pattern.length && pattern[end] !== "]") end++;
      const cls = pattern.slice(i, end + 1);
      tokens.push(
        <span key={i} className="text-emerald-500">{cls}</span>,
      );
      i = end + 1;
      continue;
    }

    // Groups: ( and )
    if (ch === "(" || ch === ")") {
      tokens.push(
        <span key={i} className="text-primary font-semibold">{ch}</span>,
      );
      i++;
      continue;
    }

    // Quantifiers: * + ? {n,m}
    if ("*+?".includes(ch)) {
      tokens.push(
        <span key={i} className="text-rose-500">{ch}</span>,
      );
      i++;
      continue;
    }
    if (ch === "{") {
      let end = i + 1;
      while (end < pattern.length && pattern[end] !== "}") end++;
      tokens.push(
        <span key={i} className="text-rose-500">{pattern.slice(i, end + 1)}</span>,
      );
      i = end + 1;
      continue;
    }

    // Anchors and alternation: ^ $ |
    if ("^$|".includes(ch)) {
      tokens.push(
        <span key={i} className="text-primary font-semibold">{ch}</span>,
      );
      i++;
      continue;
    }

    // Dot (any char)
    if (ch === ".") {
      tokens.push(
        <span key={i} className="text-amber-500">{ch}</span>,
      );
      i++;
      continue;
    }

    // Literal characters
    tokens.push(<span key={i}>{ch}</span>);
    i++;
  }
  return tokens;
}

function RegexInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [valid, setValid] = useState(true);

  const validate = (v: string) => {
    try {
      if (v) new RegExp(v);
      setValid(true);
    } catch {
      setValid(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="relative">
        {/* Highlight layer */}
        <div
          className="absolute inset-0 flex items-center px-3 py-2 font-mono text-sm pointer-events-none overflow-hidden whitespace-pre"
          aria-hidden
        >
          {value ? highlightRegex(value) : (
            <span className="text-muted-foreground">{!focused ? placeholder : ""}</span>
          )}
        </div>
        {/* Actual input — transparent text, visible caret */}
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            validate(e.target.value);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder=""
          required
          className="flex h-10 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono text-transparent caret-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        />
      </div>
      {!valid && value && (
        <p className="text-[11px] text-destructive">正则表达式语法错误</p>
      )}
    </div>
  );
}

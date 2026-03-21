"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DetailRow } from "@/components/panel-helpers";
import { X, FlaskConical, Trash2, Save, Loader2 } from "lucide-react";
import { useUpdateCriterion } from "@/lib/hooks/use-criteria";
import type { Criterion, LLMModel } from "@/lib/types";
import { utc, extractErrorDetail } from "@/lib/utils";

const typeLabel: Record<string, string> = {
  preset: "预设指标",
  regex: "正则",
  script: "脚本",
  llm_judge: "LLM 评判",
};

const presetMetrics = [
  { value: "exact_match", label: "精确匹配" },
  { value: "contains", label: "包含匹配" },
  { value: "numeric", label: "数值接近" },
  { value: "bleu", label: "BLEU" },
  { value: "rouge_l", label: "ROUGE-L" },
  { value: "f1", label: "F1" },
  { value: "cosine_similarity", label: "余弦相似度" },
];

interface CriterionDetailPanelProps {
  criterion: Criterion;
  models: LLMModel[];
  onClose: () => void;
  onTest: (id: string) => void;
  onDelete: (target: { id: string; name: string }) => void;
}

export function CriterionDetailPanel({
  criterion,
  models,
  onClose,
  onTest,
  onDelete,
}: CriterionDetailPanelProps) {
  const update = useUpdateCriterion();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Parse config into editable state
  const parsedCfg = (() => {
    try {
      return JSON.parse(criterion.config_json) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();

  const [name, setName] = useState(criterion.name);
  const [metric, setMetric] = useState(String(parsedCfg.metric ?? "exact_match"));
  const [pattern, setPattern] = useState(String(parsedCfg.pattern ?? ""));
  const [matchMode, setMatchMode] = useState(String(parsedCfg.match_mode ?? "contains"));
  const [scriptPath, setScriptPath] = useState(String(parsedCfg.script_path ?? ""));
  const [entrypoint, setEntrypoint] = useState(String(parsedCfg.entrypoint ?? ""));
  const [judgePrompt, setJudgePrompt] = useState(String(parsedCfg.system_prompt ?? ""));
  const [judgeModelId, setJudgeModelId] = useState(String(parsedCfg.judge_model_id ?? ""));

  // Reset state when criterion changes
  useEffect(() => {
    const cfg = (() => {
      try {
        return JSON.parse(criterion.config_json) as Record<string, unknown>;
      } catch {
        return {} as Record<string, unknown>;
      }
    })();
    setName(criterion.name);
    setMetric(String(cfg.metric ?? "exact_match"));
    setPattern(String(cfg.pattern ?? ""));
    setMatchMode(String(cfg.match_mode ?? "contains"));
    setScriptPath(String(cfg.script_path ?? ""));
    setEntrypoint(String(cfg.entrypoint ?? ""));
    setJudgePrompt(String(cfg.system_prompt ?? ""));
    setJudgeModelId(String(cfg.judge_model_id ?? ""));
    setError("");
    setSaved(false);
  }, [criterion.id, criterion.config_json, criterion.name]);

  const buildConfigJson = (): string => {
    if (criterion.type === "preset") return JSON.stringify({ metric });
    if (criterion.type === "regex") return JSON.stringify({ pattern, match_mode: matchMode });
    if (criterion.type === "script") {
      const cfg: Record<string, string> = { script_path: scriptPath };
      if (entrypoint) cfg.entrypoint = entrypoint;
      return JSON.stringify(cfg);
    }
    if (criterion.type === "llm_judge") {
      const cfg: Record<string, string> = { system_prompt: judgePrompt };
      if (judgeModelId) cfg.judge_model_id = judgeModelId;
      return JSON.stringify(cfg);
    }
    return criterion.config_json;
  };

  const handleSave = async () => {
    setError("");
    setSaved(false);
    try {
      await update.mutateAsync({
        id: criterion.id,
        name,
        config_json: buildConfigJson(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setError(extractErrorDetail(err, "保存失败"));
    }
  };

  const judgeModel = models.find((m) => m.id === judgeModelId);

  return (
    <div className="w-1/3 shrink-0">
      <Card className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold truncate">{criterion.name}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mr-1" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <CardContent className="pt-0 space-y-4">
          {/* Name */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
          </div>

          {/* Type (read-only) */}
          <DetailRow
            label="类型"
            value={<Badge variant="outline" className="text-xs font-normal">{typeLabel[criterion.type] ?? criterion.type}</Badge>}
          />

          {/* Type-specific editable fields */}
          {criterion.type === "preset" && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">指标</Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presetMetrics.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {criterion.type === "regex" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">正则表达式</Label>
                <Input value={pattern} onChange={(e) => setPattern(e.target.value)} className="h-8 text-xs font-mono" placeholder="\\d+\\.?\\d*" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">匹配模式</Label>
                <Select value={matchMode} onValueChange={setMatchMode}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exact">完全匹配</SelectItem>
                    <SelectItem value="contains">包含匹配</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {criterion.type === "script" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">脚本路径</Label>
                <Input value={scriptPath} onChange={(e) => setScriptPath(e.target.value)} className="h-8 text-xs font-mono" placeholder="/path/to/eval.py" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">入口函数</Label>
                <Input value={entrypoint} onChange={(e) => setEntrypoint(e.target.value)} className="h-8 text-xs font-mono" placeholder="evaluate" />
              </div>
            </>
          )}

          {criterion.type === "llm_judge" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">评判模型</Label>
                <Select value={judgeModelId} onValueChange={setJudgeModelId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.length === 0 ? (
                      <div className="px-3 py-3 text-center text-xs text-muted-foreground">暂无模型</div>
                    ) : models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}{m.model_name ? ` (${m.model_name})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {judgeModel && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{judgeModel.provider} · {judgeModel.endpoint_url}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">系统提示词</Label>
                <textarea
                  value={judgePrompt}
                  onChange={(e) => setJudgePrompt(e.target.value)}
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="你是一个评估专家..."
                />
              </div>
            </>
          )}

          {/* Created at */}
          <DetailRow label="创建时间" value={utc(criterion.created_at)?.toLocaleString() ?? "—"} />

          {/* Save / error */}
          {error && <p className="text-xs text-destructive">{error}</p>}
          {saved && <p className="text-xs text-emerald-600">已保存</p>}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="flex-1" onClick={handleSave} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              保存
            </Button>
            <Button size="sm" variant="outline" onClick={() => onTest(criterion.id)}>
              <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
              测试
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive hover:bg-destructive/5"
              onClick={() => onDelete({ id: criterion.id, name: criterion.name })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

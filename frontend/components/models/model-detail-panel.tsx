"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailRow } from "@/components/panel-helpers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Zap,
  Loader2,
  Trash2,
  Pencil,
  Check,
  KeyRound,
  MessageSquare,
  ChevronDown,
  Send,
} from "lucide-react";
import { useUpdateModel, useTestModel, usePlayground } from "@/lib/hooks/use-models";
import type { LLMModel } from "@/lib/types";
import { cn, utc } from "@/lib/utils";
import { formatTime } from "@/lib/time";

const typeLabel: Record<string, string> = {
  api: "API",
  local: "本地",
  huggingface: "HuggingFace",
  modelscope: "ModelScope",
};

const apiFormatLabel: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

interface ModelDetailPanelProps {
  model: LLMModel;
  onClose: () => void;
  onDelete: (target: { id: string; name: string }) => void;
}

export function ModelDetailPanel({
  model,
  onClose,
  onDelete,
}: ModelDetailPanelProps) {
  const update = useUpdateModel();
  const testModel = useTestModel();
  const playground = usePlayground();

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});
  const [showPlayground, setShowPlayground] = useState(false);
  const [pgPrompt, setPgPrompt] = useState("");
  const [pgTemperature, setPgTemperature] = useState("0.7");
  const [pgMaxTokens, setPgMaxTokens] = useState("512");

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResults((prev) => ({
      ...prev,
      [id]: { ok: false, message: "测试中..." },
    }));
    try {
      const result = await testModel.mutateAsync(id);
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: result.ok, message: result.message },
      }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, message: "连接失败" },
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="w-1/3 shrink-0">
      <Card className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-semibold truncate">{model.name}</h3>
            {model.last_test_ok === true && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                在线
              </span>
            )}
            {model.last_test_ok === false && (
              <span className="flex items-center gap-1 text-[11px] text-destructive shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                离线
              </span>
            )}
            {model.last_test_ok == null && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                未测试
              </span>
            )}
          </div>
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
          <div className="flex items-center gap-2">
            {model.description && (
              <p className="text-xs text-muted-foreground flex-1">
                {model.description}
              </p>
            )}
            {model.deploy_status && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                {model.deploy_status}
              </Badge>
            )}
          </div>

          <div className="space-y-2.5">
            <DetailRow label="提供商" value={model.provider} />
            <DetailRow
              label="类型"
              value={
                <Badge
                  variant="outline"
                  className="text-xs font-normal"
                >
                  {typeLabel[model.model_type] ?? model.model_type}
                </Badge>
              }
            />
            <EditableSelect
              label="API 协议"
              value={model.api_format}
              displayValue={
                apiFormatLabel[model.api_format] ?? model.api_format
              }
              options={[
                { value: "openai", label: "OpenAI" },
                { value: "anthropic", label: "Anthropic" },
              ]}
              onSave={(v) =>
                update.mutate({
                  id: model.id,
                  api_format: v,
                })
              }
            />
            <EditableText
              label="模型 ID"
              value={model.model_name}
              mono
              onSave={(v) =>
                update.mutate({
                  id: model.id,
                  model_name: v,
                })
              }
            />
            <EditableText
              label="端点"
              value={model.endpoint_url}
              mono
              small
              onSave={(v) =>
                update.mutate({
                  id: model.id,
                  endpoint_url: v,
                })
              }
            />
            <EditableSecret
              label="API 密钥"
              onSave={(v) =>
                update.mutate({
                  id: model.id,
                  api_key: v,
                })
              }
            />
            <EditableText
              label="最大 Token"
              value={
                model.max_tokens ? String(model.max_tokens) : ""
              }
              mono
              placeholder="未设置"
              onSave={(v) =>
                update.mutate({
                  id: model.id,
                  max_tokens: v ? parseInt(v) : null,
                })
              }
            />
            <EditableText
              label="描述"
              value={model.description}
              placeholder="无描述"
              onSave={(v) =>
                update.mutate({
                  id: model.id,
                  description: v,
                })
              }
            />
            <DetailRow
              label="注册时间"
              value={formatTime(model.created_at)}
            />
          </div>

          {/* Test result banner */}
          {testResults[model.id] &&
            testResults[model.id].message !== "测试中..." && (
              <div
                className={`rounded-md px-3 py-2 text-xs ${
                  testResults[model.id].ok
                    ? "bg-emerald-500/10 text-emerald-700"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {testResults[model.id].message}
              </div>
            )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => handleTest(model.id)}
              disabled={testingId === model.id}
            >
              {testingId === model.id ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="mr-1.5 h-3.5 w-3.5" />
              )}
              测试连接
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive hover:bg-destructive/5"
              onClick={() =>
                onDelete({
                  id: model.id,
                  name: model.name,
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Playground */}
          <div className="border-t pt-3 mt-3">
            <button
              onClick={() => setShowPlayground(!showPlayground)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Playground
              <ChevronDown className={cn("h-3 w-3 transition-transform", showPlayground && "rotate-180")} />
            </button>
            {showPlayground && (
              <div className="mt-3 space-y-2.5">
                <textarea
                  value={pgPrompt}
                  onChange={(e) => setPgPrompt(e.target.value)}
                  placeholder="输入提示词..."
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                />
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <label className="text-[11px] text-muted-foreground">温度</label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={pgTemperature}
                      onChange={(e) => setPgTemperature(e.target.value)}
                      className="h-7 w-16 text-xs font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[11px] text-muted-foreground">Token</label>
                    <Input
                      type="number"
                      step="64"
                      min="1"
                      value={pgMaxTokens}
                      onChange={(e) => setPgMaxTokens(e.target.value)}
                      className="h-7 w-20 text-xs font-mono"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="ml-auto h-7 text-xs"
                    disabled={!pgPrompt.trim() || playground.isPending}
                    onClick={() =>
                      playground.mutate({
                        model_id: model.id,
                        prompt: pgPrompt,
                        temperature: parseFloat(pgTemperature) || 0.7,
                        max_tokens: parseInt(pgMaxTokens) || 512,
                      })
                    }
                  >
                    {playground.isPending ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="mr-1 h-3 w-3" />
                    )}
                    发送
                  </Button>
                </div>
                {playground.data && (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                    <pre className="text-xs whitespace-pre-wrap break-words font-mono">
                      {playground.data.output}
                    </pre>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1 border-t">
                      <span>延迟 {playground.data.latency_ms}ms</span>
                      <span>{playground.data.tokens_generated} tokens</span>
                    </div>
                  </div>
                )}
                {playground.isError && (
                  <div className="rounded-md bg-destructive/10 text-destructive px-3 py-2 text-xs">
                    请求失败，请检查模型配置
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Inline-editable sub-components ── */

function EditableText({
  label,
  value,
  mono,
  small,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
  placeholder?: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  if (editing) {
    return (
      <div className="flex items-start justify-between gap-3 text-xs">
        <span className="text-muted-foreground shrink-0 pt-1.5">{label}</span>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className={`h-7 text-xs text-right ${mono ? "font-mono" : ""}`}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-baseline gap-2 text-xs group/edit cursor-pointer rounded-sm px-1 -mx-1 py-0.5 -my-0.5 hover:bg-background/60 transition-colors"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      <span className="text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 border-b border-dashed border-muted-foreground/20 min-w-4 translate-y-[-3px]" />
      <div className="flex items-center gap-1 shrink-0">
        {value ? (
          <span
            className={`truncate max-w-[180px] ${mono ? "font-mono" : ""} ${small ? "text-[11px]" : ""}`}
          >
            {value}
          </span>
        ) : (
          <span className="text-muted-foreground/60 italic">
            {placeholder ?? "\u2014"}
          </span>
        )}
        <Pencil className="h-2.5 w-2.5 text-muted-foreground/30 group-hover/edit:text-muted-foreground transition-colors shrink-0" />
      </div>
    </div>
  );
}

function EditableSecret({
  label,
  onSave,
}: {
  label: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);

  const commit = () => {
    if (draft.trim()) {
      onSave(draft.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setDraft("");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-start justify-between gap-3 text-xs">
        <span className="text-muted-foreground shrink-0 pt-1.5">{label}</span>
        <Input
          type="password"
          value={draft}
          placeholder="输入新密钥"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft("");
              setEditing(false);
            }
          }}
          className="h-7 text-xs text-right font-mono"
          autoFocus
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-baseline gap-2 text-xs group/edit cursor-pointer rounded-sm px-1 -mx-1 py-0.5 -my-0.5 hover:bg-background/60 transition-colors"
      onClick={() => setEditing(true)}
    >
      <span className="text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 border-b border-dashed border-muted-foreground/20 min-w-4 translate-y-[-3px]" />
      <div className="flex items-center gap-1 shrink-0">
        <span className="font-mono text-muted-foreground/70">{'••••••••'}</span>
        {saved ? (
          <Check className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
        ) : (
          <KeyRound className="h-2.5 w-2.5 text-muted-foreground/30 group-hover/edit:text-muted-foreground transition-colors shrink-0" />
        )}
      </div>
    </div>
  );
}

function EditableSelect({
  label,
  value,
  displayValue,
  options,
  onSave,
}: {
  label: string;
  value: string;
  displayValue: string;
  options: { value: string; label: string }[];
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="flex items-start justify-between gap-3 text-xs">
        <span className="text-muted-foreground shrink-0 pt-1.5">{label}</span>
        <Select
          value={value}
          onValueChange={(v) => {
            setEditing(false);
            if (v !== value) onSave(v);
          }}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(false);
          }}
        >
          <SelectTrigger className="h-7 text-xs w-auto min-w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div
      className="flex items-baseline gap-2 text-xs group/edit cursor-pointer rounded-sm px-1 -mx-1 py-0.5 -my-0.5 hover:bg-background/60 transition-colors"
      onClick={() => setEditing(true)}
    >
      <span className="text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 border-b border-dashed border-muted-foreground/20 min-w-4 translate-y-[-3px]" />
      <div className="flex items-center gap-1 shrink-0">
        <Badge variant="outline" className="text-xs font-normal">
          {displayValue}
        </Badge>
        <Pencil className="h-2.5 w-2.5 text-muted-foreground/30 group-hover/edit:text-muted-foreground transition-colors shrink-0" />
      </div>
    </div>
  );
}

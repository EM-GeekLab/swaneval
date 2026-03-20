"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailRow } from "@/components/panel-helpers";
import { X, FlaskConical, Trash2 } from "lucide-react";
import type { Criterion, LLMModel } from "@/lib/types";
import { utc } from "@/lib/utils";

const typeLabel: Record<string, string> = {
  preset: "预设指标",
  regex: "正则",
  script: "脚本",
  llm_judge: "LLM 评判",
};

function configSummary(configJson: string, type: string): string {
  try {
    const cfg = JSON.parse(configJson);
    if (type === "preset") return cfg.metric;
    if (type === "regex") return cfg.pattern;
    if (type === "script") return cfg.script_path;
    if (type === "llm_judge") return cfg.system_prompt ? "自定义评判" : "LLM Judge";
    return configJson;
  } catch {
    return configJson;
  }
}

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
  return (
    <div className="w-1/3 shrink-0">
      <Card className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold truncate">
            {criterion.name}
          </h3>
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
              label="类型"
              value={
                <Badge
                  variant="outline"
                  className="text-xs font-normal"
                >
                  {typeLabel[criterion.type] ?? criterion.type}
                </Badge>
              }
            />
            {(() => {
              try {
                const cfg = JSON.parse(criterion.config_json);
                if (criterion.type === "preset")
                  return (
                    <DetailRow
                      label="指标"
                      value={<code className="font-mono text-xs">{cfg.metric}</code>}
                    />
                  );
                if (criterion.type === "regex")
                  return (
                    <DetailRow
                      label="正则"
                      value={<code className="font-mono text-xs">{cfg.pattern}</code>}
                    />
                  );
                if (criterion.type === "script")
                  return (
                    <>
                      <DetailRow
                        label="脚本"
                        value={<code className="font-mono text-xs truncate block max-w-[180px]">{cfg.script_path}</code>}
                      />
                      {cfg.entrypoint && (
                        <DetailRow
                          label="入口"
                          value={<code className="font-mono text-xs">{cfg.entrypoint}</code>}
                        />
                      )}
                    </>
                  );
                if (criterion.type === "llm_judge") {
                  const judgeModel = models.find((m) => m.id === cfg.judge_model_id);
                  return (
                    <>
                      {judgeModel && (
                        <DetailRow label="评判模型" value={judgeModel.name} />
                      )}
                      {cfg.system_prompt && (
                        <DetailRow
                          label="提示词"
                          value={
                            <span className="text-xs truncate block max-w-[180px]">
                              {cfg.system_prompt.slice(0, 60)}
                              {cfg.system_prompt.length > 60 ? "..." : ""}
                            </span>
                          }
                        />
                      )}
                    </>
                  );
                }
                return (
                  <DetailRow
                    label="配置"
                    value={<code className="font-mono text-xs">{configSummary(criterion.config_json, criterion.type)}</code>}
                  />
                );
              } catch {
                return (
                  <DetailRow
                    label="配置"
                    value={<code className="font-mono text-xs">{criterion.config_json}</code>}
                  />
                );
              }
            })()}
            <DetailRow
              label="创建时间"
              value={
                utc(criterion.created_at)?.toLocaleString() ?? "\u2014"
              }
            />
          </div>

          {/* Raw config */}
          <div className="space-y-1">
            <p className="text-xs text-base-content/50">配置 JSON</p>
            <pre className="rounded-md bg-base-200 p-2.5 text-xs font-mono overflow-auto max-h-32">
              {(() => {
                try {
                  return JSON.stringify(
                    JSON.parse(criterion.config_json),
                    null,
                    2,
                  );
                } catch {
                  return criterion.config_json;
                }
              })()}
            </pre>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => onTest(criterion.id)}
            >
              <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
              测试
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-error hover:text-error hover:bg-error/5"
              onClick={() =>
                onDelete({
                  id: criterion.id,
                  name: criterion.name,
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

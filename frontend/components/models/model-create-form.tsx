"use client";

import { useState } from "react";
import { JsonImportBar } from "@/components/json-import-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelField } from "@/components/panel-helpers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { useCreateModel } from "@/lib/hooks/use-models";

const emptyForm = {
  name: "",
  provider: "",
  endpoint_url: "",
  api_key: "",
  model_type: "api",
  api_format: "openai",
  description: "",
  model_name: "",
  max_tokens: "4096",
  source_model_id: "",
};

interface ModelCreateFormProps {
  onSuccess: () => void;
  onClose: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ModelCreateForm({ onSuccess, onClose: _onClose }: ModelCreateFormProps) {
  const create = useCreateModel();

  const [form, setForm] = useState({ ...emptyForm });

  const importFromJson = (text: string) => {
    const data = JSON.parse(text); // safe: JsonImportBar validates JSON
    setForm((f) => ({
      ...f,
      name: data.name ?? f.name,
      provider: data.provider ?? f.provider,
      endpoint_url: data.endpoint_url ?? f.endpoint_url,
      api_key: data.api_key ?? f.api_key,
      model_type: data.model_type ?? f.model_type,
      api_format: data.api_format ?? f.api_format,
      description: data.description ?? f.description,
      model_name: data.model_name ?? f.model_name,
      max_tokens:
        data.max_tokens != null ? String(data.max_tokens) : f.max_tokens,
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const isHF = form.model_type === "huggingface";
    const isMS = form.model_type === "modelscope";
    const isManaged = isHF || isMS;
    await create.mutateAsync({
      name: form.name,
      provider: isHF ? "huggingface" : isMS ? "modelscope" : form.provider,
      endpoint_url: isHF
        ? `https://api-inference.huggingface.co/models/${form.model_name}/v1/chat/completions`
        : isMS
          ? `https://api-inference.modelscope.cn/v1/chat/completions`
          : form.endpoint_url,
      api_key: form.api_key || undefined,
      model_type: form.model_type,
      api_format: isManaged ? "openai" : form.api_format,
      description: form.description || undefined,
      model_name: form.model_name || undefined,
      max_tokens: form.max_tokens ? parseInt(form.max_tokens) : undefined,
      source_model_id: isManaged ? form.model_name : form.source_model_id || undefined,
    });
    onSuccess();
  };

  return (
    <>
      <JsonImportBar onImport={importFromJson} className="mb-3" />

      <form onSubmit={handleCreate} className="space-y-3">
        <PanelField label="显示名称" required>
          <Input
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
            placeholder="GPT-4o"
            required
          />
        </PanelField>
        <div className="grid grid-cols-2 gap-2">
          <PanelField label="提供商" required>
            <Input
              value={form.provider}
              onChange={(e) =>
                setForm({ ...form, provider: e.target.value })
              }
              placeholder="openai"
              required
            />
          </PanelField>
          <PanelField label="类型">
            <Select
              value={form.model_type}
              onValueChange={(v) =>
                setForm({ ...form, model_type: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="api">API</SelectItem>
                <SelectItem value="local">本地</SelectItem>
                <SelectItem value="huggingface">HuggingFace</SelectItem>
                <SelectItem value="modelscope">ModelScope</SelectItem>
              </SelectContent>
            </Select>
          </PanelField>
        </div>
        {form.model_type === "huggingface" ? (
          <>
            <PanelField label="HuggingFace 模型 ID" required>
              <Input
                value={form.model_name}
                onChange={(e) =>
                  setForm({ ...form, model_name: e.target.value })
                }
                placeholder="Qwen/Qwen2.5-0.5B-Instruct"
                className="font-mono"
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                HuggingFace 模型仓库 ID，将通过 Inference API 调用
              </p>
            </PanelField>
            <PanelField label="HF Token">
              <Input
                type="password"
                value={form.api_key}
                onChange={(e) =>
                  setForm({ ...form, api_key: e.target.value })
                }
                placeholder="hf_..."
                className="font-mono"
              />
            </PanelField>
          </>
        ) : form.model_type === "modelscope" ? (
          <>
            <PanelField label="ModelScope 模型 ID" required>
              <Input
                value={form.model_name}
                onChange={(e) =>
                  setForm({ ...form, model_name: e.target.value })
                }
                placeholder="Qwen/Qwen2.5-0.5B-Instruct"
                className="font-mono"
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                ModelScope 模型 ID，将通过 Inference API 调用
              </p>
            </PanelField>
            <PanelField label="MS Token">
              <Input
                type="password"
                value={form.api_key}
                onChange={(e) =>
                  setForm({ ...form, api_key: e.target.value })
                }
                placeholder="ms_..."
                className="font-mono"
              />
            </PanelField>
          </>
        ) : (
          <>
            <PanelField label="API 协议">
              <Select
                value={form.api_format}
                onValueChange={(v) =>
                  setForm({ ...form, api_format: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                </SelectContent>
              </Select>
            </PanelField>
            <PanelField label="模型 ID">
              <Input
                value={form.model_name}
                onChange={(e) =>
                  setForm({ ...form, model_name: e.target.value })
                }
                placeholder="gpt-4o-2024-08-06"
                className="font-mono"
              />
            </PanelField>
            <PanelField label="端点 URL" required>
              <Input
                value={form.endpoint_url}
                onChange={(e) =>
                  setForm({ ...form, endpoint_url: e.target.value })
                }
                placeholder="https://api.openai.com/v1/..."
                className="font-mono"
                required
              />
            </PanelField>
            <PanelField label="API 密钥">
              <Input
                type="password"
                value={form.api_key}
                onChange={(e) =>
                  setForm({ ...form, api_key: e.target.value })
                }
                placeholder="sk-..."
                className="font-mono"
              />
            </PanelField>
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <PanelField label="最大 Token">
            <Input
              type="number"
              value={form.max_tokens}
              onChange={(e) =>
                setForm({ ...form, max_tokens: e.target.value })
              }
            />
          </PanelField>
        </div>
        <PanelField label="描述">
          <Input
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            placeholder="备注（可选）"
          />
        </PanelField>
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
            {create.isPending ? "添加中..." : "添加模型"}
          </Button>
        </div>
      </form>
    </>
  );
}

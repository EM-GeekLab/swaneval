"use client";

import { useState } from "react";
import { JsonImportBar } from "@/components/json-import-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelField } from "@/components/panel-helpers";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, Check, X as XIcon, Globe, Server } from "lucide-react";
import { useCreateModel } from "@/lib/hooks/use-models";
import { useAuthStore } from "@/lib/stores/auth";
import { useUserTokens } from "@/lib/hooks/use-users";
import { useClusters } from "@/lib/hooks/use-clusters";

interface ModelCreateFormProps {
  onSuccess: () => void;
  onClose: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ModelCreateForm({ onSuccess, onClose: _onClose }: ModelCreateFormProps) {
  const create = useCreateModel();
  const user = useAuthStore((s) => s.user);
  const { data: tokenStatus } = useUserTokens();
  const { data: clusters = [] } = useClusters();
  const accountHref = user?.role === "admin" ? `/admin?user=${user.id}` : "/account";

  const [mode, setMode] = useState<"api" | "selfhosted">("api");

  // API model form
  const [apiForm, setApiForm] = useState({
    name: "", provider: "", endpoint_url: "", api_key: "",
    api_format: "openai", model_name: "", max_tokens: "4096", description: "",
  });

  // Self-hosted model form
  const [shForm, setShForm] = useState({
    name: "", source: "huggingface" as "huggingface" | "modelscope",
    model_id: "", description: "", max_tokens: "4096",
    cluster_id: "", gpu_count: "1", memory_gb: "40",
  });

  const importFromJson = (text: string) => {
    const data = JSON.parse(text);
    if (data.model_type === "huggingface" || data.model_type === "modelscope") {
      setMode("selfhosted");
      setShForm((f) => ({
        ...f,
        name: data.name ?? f.name,
        source: data.model_type ?? f.source,
        model_id: data.model_name ?? data.source_model_id ?? f.model_id,
        description: data.description ?? f.description,
        max_tokens: data.max_tokens != null ? String(data.max_tokens) : f.max_tokens,
      }));
    } else {
      setMode("api");
      setApiForm((f) => ({
        ...f,
        name: data.name ?? f.name,
        provider: data.provider ?? f.provider,
        endpoint_url: data.endpoint_url ?? f.endpoint_url,
        api_key: data.api_key ?? f.api_key,
        api_format: data.api_format ?? f.api_format,
        model_name: data.model_name ?? f.model_name,
        max_tokens: data.max_tokens != null ? String(data.max_tokens) : f.max_tokens,
        description: data.description ?? f.description,
      }));
    }
  };

  const handleCreateApi = async (e: React.FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({
      name: apiForm.name,
      provider: apiForm.provider,
      endpoint_url: apiForm.endpoint_url,
      api_key: apiForm.api_key || undefined,
      model_type: "api",
      api_format: apiForm.api_format as "openai" | "anthropic",
      model_name: apiForm.model_name || undefined,
      max_tokens: apiForm.max_tokens ? parseInt(apiForm.max_tokens) : undefined,
      description: apiForm.description || undefined,
    });
    onSuccess();
  };

  const handleCreateSelfHosted = async (e: React.FormEvent) => {
    e.preventDefault();
    const isHF = shForm.source === "huggingface";
    await create.mutateAsync({
      name: shForm.name || shForm.model_id.split("/").pop() || "",
      provider: shForm.source,
      endpoint_url: isHF
        ? `https://api-inference.huggingface.co/models/${shForm.model_id}/v1/chat/completions`
        : `https://api-inference.modelscope.cn/v1/chat/completions`,
      model_type: shForm.source,
      api_format: "openai",
      model_name: shForm.model_id,
      source_model_id: shForm.model_id,
      max_tokens: shForm.max_tokens ? parseInt(shForm.max_tokens) : undefined,
      description: shForm.description || undefined,
    });
    onSuccess();
  };

  const tokenSet = shForm.source === "huggingface" ? tokenStatus?.hf_token_set : tokenStatus?.ms_token_set;
  const tokenLabel = shForm.source === "huggingface" ? "HF Token" : "MS Token";

  return (
    <>
      <JsonImportBar onImport={importFromJson} className="mb-3" />

      <Tabs value={mode} onValueChange={(v) => setMode(v as "api" | "selfhosted")}>
        <TabsList className="w-full mb-3">
          <TabsTrigger value="api" className="flex-1">
            <Globe className="mr-1.5 h-3.5 w-3.5" />
            API 模型
          </TabsTrigger>
          <TabsTrigger value="selfhosted" className="flex-1">
            <Server className="mr-1.5 h-3.5 w-3.5" />
            自托管模型
          </TabsTrigger>
        </TabsList>

        {/* ── API Model ── */}
        <TabsContent value="api">
          <form onSubmit={handleCreateApi} className="space-y-3">
            <PanelField label="显示名称" required>
              <Input
                value={apiForm.name}
                onChange={(e) => setApiForm({ ...apiForm, name: e.target.value })}
                placeholder="GPT-4o"
                required
              />
            </PanelField>
            <div className="grid grid-cols-2 gap-2">
              <PanelField label="提供商" required>
                <Input
                  value={apiForm.provider}
                  onChange={(e) => setApiForm({ ...apiForm, provider: e.target.value })}
                  placeholder="openai"
                  required
                />
              </PanelField>
              <PanelField label="API 协议">
                <Select
                  value={apiForm.api_format}
                  onValueChange={(v) => setApiForm({ ...apiForm, api_format: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                  </SelectContent>
                </Select>
              </PanelField>
            </div>
            <PanelField label="端点 URL" required>
              <Input
                value={apiForm.endpoint_url}
                onChange={(e) => setApiForm({ ...apiForm, endpoint_url: e.target.value })}
                placeholder="https://api.openai.com/v1/chat/completions"
                className="font-mono"
                required
              />
            </PanelField>
            <div className="grid grid-cols-2 gap-2">
              <PanelField label="模型 ID">
                <Input
                  value={apiForm.model_name}
                  onChange={(e) => setApiForm({ ...apiForm, model_name: e.target.value })}
                  placeholder="gpt-4o-2024-08-06"
                  className="font-mono"
                />
              </PanelField>
              <PanelField label="API 密钥">
                <Input
                  type="password"
                  value={apiForm.api_key}
                  onChange={(e) => setApiForm({ ...apiForm, api_key: e.target.value })}
                  placeholder="sk-..."
                  className="font-mono"
                />
              </PanelField>
            </div>
            <PanelField label="描述">
              <Input
                value={apiForm.description}
                onChange={(e) => setApiForm({ ...apiForm, description: e.target.value })}
                placeholder="备注（可选）"
              />
            </PanelField>
            <div className="pt-1">
              <Button type="submit" className="w-full" disabled={create.isPending}>
                {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                {create.isPending ? "添加中..." : "添加模型"}
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* ── Self-Hosted Model ── */}
        <TabsContent value="selfhosted">
          <form onSubmit={handleCreateSelfHosted} className="space-y-3">
            <PanelField label="模型来源" required>
              <Select value={shForm.source} onValueChange={(v) => setShForm({ ...shForm, source: v as "huggingface" | "modelscope" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="huggingface">HuggingFace</SelectItem>
                  <SelectItem value="modelscope">ModelScope</SelectItem>
                </SelectContent>
              </Select>
            </PanelField>
            <PanelField label="模型 ID" required>
              <Input
                value={shForm.model_id}
                onChange={(e) => setShForm({ ...shForm, model_id: e.target.value })}
                placeholder="Qwen/Qwen2.5-7B-Instruct"
                className="font-mono"
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {shForm.source === "huggingface" ? "HuggingFace" : "ModelScope"} 模型仓库 ID
              </p>
            </PanelField>

            {/* Token status */}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {tokenSet ? (
                <>
                  <Check className="h-3 w-3 text-emerald-500" />
                  <span>{tokenLabel} 已配置</span>
                </>
              ) : (
                <>
                  <XIcon className="h-3 w-3 text-muted-foreground/50" />
                  <span>{tokenLabel} 未配置（私有模型需要）</span>
                </>
              )}
              <span>·</span>
              <a href={accountHref} className="text-primary hover:underline">去设置</a>
            </div>

            <PanelField label="显示名称">
              <Input
                value={shForm.name}
                onChange={(e) => setShForm({ ...shForm, name: e.target.value })}
                placeholder={shForm.model_id.split("/").pop() || "自动使用模型 ID"}
              />
            </PanelField>
            <PanelField label="描述">
              <Input
                value={shForm.description}
                onChange={(e) => setShForm({ ...shForm, description: e.target.value })}
                placeholder="备注（可选）"
              />
            </PanelField>

            <div className="pt-1">
              <Button type="submit" className="w-full" disabled={create.isPending}>
                {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                {create.isPending ? "注册模型" : "注册模型"}
              </Button>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                注册后可在模型详情中部署到集群，或在创建任务时选择 K8s/vLLM 后端自动部署
              </p>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </>
  );
}

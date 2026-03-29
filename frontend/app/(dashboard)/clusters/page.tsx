"use client";

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Server,
  Plus,
  Cpu,
  MemoryStick,
  HardDrive,
  RefreshCw,
  Trash2,
  X,
  Loader2,
  Copy,
  ClipboardCheck,
  ChevronDown,
} from "lucide-react";
import { TableEmpty, TableLoading } from "@/components/table-states";
import { JsonImportBar } from "@/components/json-import-bar";
import { cn } from "@/lib/utils";
import { InlineEditField } from "@/components/panel-helpers";
import { RefreshIndicator } from "@/components/refresh-indicator";
import { DeleteDialog } from "@/components/delete-dialog";
import { formatTime } from "@/lib/time";
import { extractErrorDetail } from "@/lib/utils";
import {
  useClusters,
  useCluster,
  useCreateCluster,
  useUpdateCluster,
  useDeleteCluster,
  useProbeCluster,
  useClusterNodes,
  useGpuStatus,
} from "@/lib/hooks/use-clusters";
import { useActiveDeployments } from "@/lib/hooks/use-models";
import type { ComputeCluster } from "@/lib/types";
import { useUrlSelection } from "@/lib/hooks/use-url-selection";
import { DEPLOY_STATUS } from "@/lib/constants";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 4) return (bytes / 1024 ** 4).toFixed(1) + " TiB";
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + " GiB";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(0) + " MiB";
  return (bytes / 1024).toFixed(0) + " KiB";
}

function formatCpu(millicores: number): string {
  const cores = millicores / 1000;
  return cores % 1 === 0 ? `${cores} 核` : `${cores.toFixed(1)} 核`;
}

const statusBadgeVariant: Record<
  string,
  "success" | "warning" | "destructive" | "outline"
> = {
  ready: "success",
  connecting: "warning",
  provisioning: "warning",
  probing: "warning",
  error: "destructive",
  offline: "outline",
};

const statusLabel: Record<string, string> = {
  ready: "就绪",
  connecting: "连接中",
  provisioning: "配置中",
  probing: "探测中",
  error: "异常",
  offline: "离线",
};

function ClusterDetail({
  cluster: clusterProp,
  onClose,
  onDelete,
}: {
  cluster: ComputeCluster;
  onClose: () => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const probeCluster = useProbeCluster();
  // Fetch fresh cluster data independently — don't rely on parent's stale prop
  const { data: liveCluster } = useCluster(clusterProp.id);
  const cluster = liveCluster ?? clusterProp;
  const [isProbing, setIsProbing] = useState(false);

  const { data: nodes = [], isLoading: nodesLoading } = useClusterNodes(
    cluster.id,
  );
  const { data: gpuStatus } = useGpuStatus(cluster.id);
  const { data: allDeployments = [] } = useActiveDeployments();
  const deployments = allDeployments.filter((m) => m.cluster_id === cluster.id);
  const updateCluster = useUpdateCluster();
  const [probeError, setProbeError] = useState("");
  const [showKubeconfig, setShowKubeconfig] = useState(false);
  const [copied, setCopied] = useState(false);

  const refreshAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["clusters"] });
    qc.invalidateQueries({ queryKey: ["clusters", cluster.id] });
    qc.invalidateQueries({ queryKey: ["clusters", cluster.id, "nodes"] });
    qc.invalidateQueries({ queryKey: ["clusters", cluster.id, "gpu-status"] });
  }, [qc, cluster.id]);

  // Poll while probing — stop when status changes away from "connecting"
  useEffect(() => {
    if (!isProbing) return;
    if (cluster.status !== "connecting") {
      setIsProbing(false);
      return;
    }
    const timer = setInterval(refreshAll, 2000);
    return () => clearInterval(timer);
  }, [isProbing, cluster.status, refreshAll]);

  const handleProbe = async () => {
    setProbeError("");
    try {
      await probeCluster.mutateAsync(cluster.id);
      setIsProbing(true);
    } catch (err: unknown) {
      setProbeError(extractErrorDetail(err, "探测失败"));
    }
  };


  return (
    <Card className="h-full overflow-auto">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-foreground/60">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{cluster.name}</h2>
                {isProbing || cluster.status === "connecting" ? (
                  <Badge variant="warning" className="text-[10px]">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    探测中
                  </Badge>
                ) : (
                  <Badge variant={statusBadgeVariant[cluster.status] ?? "outline"}>
                    {statusLabel[cluster.status] ?? cluster.status}
                  </Badge>
                )}
              </div>
              {cluster.description && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {cluster.description}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Editable info fields */}
        <div className="space-y-2.5 mb-6 text-xs">
          {/* Name — editable */}
          <InlineEditField
            label="名称" value={cluster.name}
            onSave={(v) => updateCluster.mutateAsync({ id: cluster.id, name: v }).then(() => refreshAll())}
          />
          {/* Description — editable */}
          <InlineEditField
            label="描述" value={cluster.description || ""}
            onSave={(v) => updateCluster.mutateAsync({ id: cluster.id, description: v }).then(() => refreshAll())}
            placeholder="添加描述..."
          />
          {/* Namespace — editable */}
          <InlineEditField
            label="命名空间" value={cluster.namespace || "default"}
            onSave={(v) => updateCluster.mutateAsync({ id: cluster.id, namespace: v }).then(() => refreshAll())}
            mono
          />
          {/* vLLM image — editable */}
          <InlineEditField
            label="vLLM 镜像" value={cluster.vllm_image || ""}
            onSave={(v) => updateCluster.mutateAsync({ id: cluster.id, vllm_image: v }).then(() => refreshAll())}
            mono placeholder="默认 (vllm/vllm-openai:latest)"
          />
          {/* API Server — read-only */}
          <div>
            <dt className="text-muted-foreground mb-0.5">API 地址</dt>
            <dd className="font-mono text-[11px] break-all text-muted-foreground">{cluster.api_server_url || "—"}</dd>
          </div>
          {/* Timestamps — read-only */}
          <div className="flex gap-6">
            <div>
              <dt className="text-muted-foreground mb-0.5">最后探测</dt>
              <dd className="text-muted-foreground">{formatTime(cluster.last_probed_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground mb-0.5">创建时间</dt>
              <dd className="text-muted-foreground">{formatTime(cluster.created_at)}</dd>
            </div>
          </div>
          {/* Kubeconfig — collapsible */}
          <div>
            <button
              type="button"
              onClick={() => setShowKubeconfig(!showKubeconfig)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform", showKubeconfig && "rotate-180")} />
              <span>Kubeconfig</span>
            </button>
            {showKubeconfig && (
              <div className="mt-1.5 relative">
                <pre className="font-mono text-[10px] bg-muted rounded-md p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all text-muted-foreground">
                  {cluster.api_server_url
                    ? `# Kubeconfig 已加密存储\n# API Server: ${cluster.api_server_url}\n# 命名空间: ${cluster.namespace || "default"}\n\n# 如需查看完整内容，请在服务器上运行:\n# kubectl config view --raw`
                    : "无 Kubeconfig"}
                </pre>
                <button
                  type="button"
                  className="absolute top-2 right-2 p-1 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    navigator.clipboard.writeText(cluster.api_server_url || "");
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  title="复制 API 地址"
                >
                  {copied ? <ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* GPU Support Section */}
        <div className="mb-6 rounded-md border p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">GPU 支持</p>
            {gpuStatus?.ready ? (
              <Badge variant="success" className="text-[10px]">GPU 可用</Badge>
            ) : gpuStatus && (gpuStatus.has_device_plugin || gpuStatus.has_gpu_operator) ? (
              <Badge variant="warning" className="text-[10px]">插件已安装，无 GPU</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">未配置</Badge>
            )}
          </div>

          {gpuStatus ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>GPU 节点:</span>
                {gpuStatus.gpu_node_count > 0 ? (
                  <span className="font-mono">{gpuStatus.gpu_nodes.slice(0, 3).join(", ")}</span>
                ) : (
                  <span>无</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={gpuStatus.has_device_plugin ? "success" : "outline"}
                  className="text-[10px]"
                >
                  Device Plugin
                </Badge>
                <Badge
                  variant={gpuStatus.has_gpu_operator ? "success" : "outline"}
                  className="text-[10px]"
                >
                  GPU Operator
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">加载 GPU 状态中...</p>
          )}

          {gpuStatus && !gpuStatus.has_device_plugin && !gpuStatus.has_gpu_operator && (
            <div className="rounded-md bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-400 space-y-1">
              <p className="font-medium">未检测到 NVIDIA GPU 支持</p>
              <p>
                部署 GPU 模型前，需要在集群上安装 NVIDIA Device Plugin 或 GPU Operator。
                安装完成后点击「刷新资源」重新检测。
              </p>
              <p>
                <a href="https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/getting-started.html" target="_blank" rel="noopener" className="text-primary hover:underline">NVIDIA GPU Operator 安装指南 →</a>
              </p>
            </div>
          )}
        </div>

        {cluster.status_message && (
          <div className={`mb-6 rounded-md px-3 py-2 text-xs ${
            cluster.status === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground"
          }`}>
            {cluster.status_message}
          </div>
        )}

        {/* Resource cards */}
        {(() => {
          const totalGpu = nodes.length > 0
            ? nodes.reduce((s, n) => s + n.gpu_count, 0)
            : cluster.gpu_count;
          const gpuType = nodes.find(n => n.gpu_type)?.gpu_type || cluster.gpu_type || "";
          return (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">GPU</span>
                </div>
                {totalGpu > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{gpuType || "GPU"}</span>
                    <Badge variant="secondary" className="text-[10px] tabular-nums">×{totalGpu}</Badge>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">无</p>
                )}
              </div>
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">CPU</span>
                </div>
                <p className="text-sm font-semibold tabular-nums">{formatCpu(cluster.cpu_total_millicores)}</p>
                <p className="text-[10px] text-muted-foreground">{cluster.node_count} 个节点</p>
              </div>
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <MemoryStick className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">内存</span>
                </div>
                <p className="text-sm font-semibold tabular-nums">{formatBytes(cluster.memory_total_bytes)}</p>
              </div>
            </div>
          );
        })()}

        {/* Nodes table */}
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-3">节点列表</h3>
          {nodesLoading ? (
            <TableLoading text="加载节点..." />
          ) : nodes.length === 0 ? (
            <TableEmpty title="暂无节点数据" />
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>节点名</TableHead>
                    <TableHead>GPU</TableHead>
                    <TableHead>CPU</TableHead>
                    <TableHead>内存</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nodes.map((node) => (
                    <TableRow key={node.name}>
                      <TableCell className="font-mono text-xs">
                        {node.name}
                      </TableCell>
                      <TableCell>
                        {node.gpu_count > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs">{node.gpu_type || "GPU"}</span>
                            <Badge variant="secondary" className="text-[10px] tabular-nums">×{node.gpu_count}</Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-xs">{formatCpu(node.cpu_millicores)}</TableCell>
                      <TableCell className="tabular-nums text-xs">{formatBytes(node.memory_bytes)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            node.status === "Ready" ? "success" : "destructive"
                          }
                          className="text-[10px]"
                        >
                          {node.status === "Ready" ? "就绪" : "异常"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Active deployments */}
        {deployments.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium mb-3">
              活跃部署
              <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                ({deployments.length})
              </span>
            </h3>
            <div className="space-y-2">
              {deployments.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{m.name}</p>
                    {(m.model_name || m.source_model_id) && (
                      <p className="text-[10px] font-mono text-muted-foreground truncate">
                        {m.model_name || m.source_model_id}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={m.deploy_status === DEPLOY_STATUS.RUNNING ? "success" : "warning"}
                    className="text-[10px] shrink-0 ml-2"
                  >
                    {m.deploy_status === DEPLOY_STATUS.RUNNING ? "运行中" : "部署中"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {probeError && (
          <p className="text-sm text-destructive mb-3">{probeError}</p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={handleProbe}
            disabled={isProbing}
          >
            {isProbing ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            刷新资源
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            删除
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}



export default function ClustersPage() {
  const { data: clusters = [], isLoading, isFetching } = useClusters();
  const createCluster = useCreateCluster();
  const deleteCluster = useDeleteCluster();

  const [selectedId, setSelectedId] = useUrlSelection("id", clusters.map(c => c.id));
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createKubeconfig, setCreateKubeconfig] = useState("");
  const [createNamespace, setCreateNamespace] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createVllmImageOption, setCreateVllmImageOption] = useState("__default__");
  const [createVllmImageCustom, setCreateVllmImageCustom] = useState("");
  const [createError, setCreateError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const selectedCluster = clusters.find((c) => c.id === selectedId) ?? null;

  const handleCreate = async () => {
    setCreateError("");
    try {
      await createCluster.mutateAsync({
        name: createName,
        kubeconfig: createKubeconfig,
        namespace: createNamespace || undefined,
        description: createDescription || undefined,
        vllm_image: createVllmImageOption === "__custom__"
          ? createVllmImageCustom || undefined
          : createVllmImageOption === "__default__"
            ? undefined
            : createVllmImageOption || undefined,
      });
      setShowCreate(false);
      setCreateName("");
      setCreateKubeconfig("");
      setCreateNamespace("");
      setCreateDescription("");
      setCreateVllmImageOption("__default__");
      setCreateVllmImageCustom("");
    } catch (err: unknown) {
      setCreateError(extractErrorDetail(err, "创建失败"));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError("");
    try {
      await deleteCluster.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
      }
    } catch (err: unknown) {
      setDeleteError(extractErrorDetail(err, "删除失败"));
    }
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-3.5rem-3rem)]">
      {/* Sidebar */}
      <div className="w-80 shrink-0 flex flex-col">
        <div className="space-y-3 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold">计算资源</h1>
              <span className="text-xs text-muted-foreground">
                共{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {clusters.length}
                </span>{" "}
                个集群
              </span>
              <RefreshIndicator isFetching={isFetching} isLoading={isLoading} />
            </div>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </div>
        </div>

        {/* Cluster list */}
        <Card className="flex-1 overflow-hidden">
          <div className="overflow-auto h-full">
            {isLoading ? (
              <TableLoading />
            ) : clusters.length === 0 ? (
              <TableEmpty
                icon={Server}
                title="暂无集群"
                description="添加一个计算集群开始使用"
              />
            ) : (
              <div className="p-1">
                {clusters.map((cluster) => (
                  <button
                    key={cluster.id}
                    type="button"
                    onClick={() => setSelectedId(cluster.id)}
                    className={`w-full text-left rounded-md px-3 py-2.5 transition-colors ${
                      selectedId === cluster.id
                        ? "bg-muted"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate flex-1">
                        {cluster.name}
                      </span>
                      <Badge
                        variant={
                          statusBadgeVariant[cluster.status] ?? "outline"
                        }
                        className="text-[10px] shrink-0"
                      >
                        {statusLabel[cluster.status] ?? cluster.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {cluster.gpu_count > 0
                        ? `${cluster.gpu_count} GPU · ${cluster.node_count} 节点`
                        : `${cluster.node_count} 个节点`
                      }
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Detail panel */}
      <div className="flex-1 min-w-0">
        {selectedCluster ? (
          <ClusterDetail
            cluster={selectedCluster}
            onClose={() => setSelectedId(null)}
            onDelete={() =>
              setDeleteTarget({
                id: selectedCluster.id,
                name: selectedCluster.name,
              })
            }
          />
        ) : (
          <Card className="h-full flex items-center justify-center">
            <TableEmpty icon={Server} title="选择一个集群查看详情" />
          </Card>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加计算集群</DialogTitle>
            <DialogDescription>
              输入集群名称和 Kubeconfig 以注册新的计算集群
            </DialogDescription>
          </DialogHeader>
          <JsonImportBar
            onImport={(text) => {
              const d = JSON.parse(text);
              if (d.name) setCreateName(d.name);
              if (d.kubeconfig) setCreateKubeconfig(d.kubeconfig);
              if (d.namespace) setCreateNamespace(d.namespace);
              if (d.description) setCreateDescription(d.description);
              if (d.vllm_image) {
                const known = [
                  "docker.m.daocloud.io/vllm/vllm-openai:latest",
                  "swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/vllm/vllm-openai:latest",
                ];
                if (known.includes(d.vllm_image)) setCreateVllmImageOption(d.vllm_image);
                else { setCreateVllmImageOption("__custom__"); setCreateVllmImageCustom(d.vllm_image); }
              }
            }}
            className="mb-1"
          />
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">集群名称<span className="text-destructive ml-0.5">*</span></Label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="例: gpu-cluster-01"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">描述</Label>
              <Input
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="可选描述"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">命名空间</Label>
              <Input
                value={createNamespace}
                onChange={(e) => setCreateNamespace(e.target.value)}
                placeholder="default"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Kubeconfig<span className="text-destructive ml-0.5">*</span></Label>
              <textarea
                value={createKubeconfig}
                onChange={(e) => setCreateKubeconfig(e.target.value)}
                placeholder="粘贴 kubeconfig YAML 内容..."
                rows={6}
                className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">vLLM 镜像源</Label>
              <Select value={createVllmImageOption} onValueChange={setCreateVllmImageOption}>
                <SelectTrigger className="h-9 font-mono text-xs">
                  <SelectValue placeholder="默认 (Docker Hub)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">默认 (vllm/vllm-openai:latest)</SelectItem>
                  <SelectItem value="docker.m.daocloud.io/vllm/vllm-openai:latest">
                    DaoCloud 镜像加速
                  </SelectItem>
                  <SelectItem value="swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/vllm/vllm-openai:latest">
                    华为云镜像加速
                  </SelectItem>
                  <SelectItem value="__custom__">自定义...</SelectItem>
                </SelectContent>
              </Select>
              {createVllmImageOption === "__custom__" && (
                <Input
                  autoFocus
                  value={createVllmImageCustom}
                  onChange={(e) => setCreateVllmImageCustom(e.target.value)}
                  placeholder="registry.example.com/vllm/vllm-openai:latest"
                  className="h-8 font-mono text-xs mt-1"
                />
              )}
              <p className="text-[11px] text-muted-foreground">
                国内网络建议使用 DaoCloud 或华为云镜像加速 vLLM 部署
              </p>
            </div>
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                createCluster.isPending || !createName || !createKubeconfig
              }
            >
              {createCluster.isPending && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <DeleteDialog
        open={!!deleteTarget}
        title="删除集群"
        name={deleteTarget?.name ?? ""}
        error={deleteError}
        isPending={deleteCluster.isPending}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError("");
        }}
      />
    </div>
  );
}

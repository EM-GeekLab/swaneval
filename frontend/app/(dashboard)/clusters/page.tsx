"use client";

import { useState } from "react";
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
} from "lucide-react";
import { TableEmpty, TableLoading } from "@/components/table-states";
import { DeleteDialog } from "@/components/delete-dialog";
import { formatTime } from "@/lib/time";
import { extractErrorDetail } from "@/lib/utils";
import {
  useClusters,
  useCreateCluster,
  useDeleteCluster,
  useProbeCluster,
  useClusterNodes,
} from "@/lib/hooks/use-clusters";
import type { ComputeCluster } from "@/lib/types";

function formatBytes(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1) + " GiB";
}

function formatCpu(millicores: number): string {
  return (millicores / 1000).toFixed(1) + " cores";
}

const statusBadgeVariant: Record<
  string,
  "success" | "warning" | "destructive" | "outline"
> = {
  ready: "success",
  provisioning: "warning",
  probing: "warning",
  error: "destructive",
  offline: "outline",
};

const statusLabel: Record<string, string> = {
  ready: "就绪",
  provisioning: "配置中",
  probing: "探测中",
  error: "异常",
  offline: "离线",
};

function ClusterDetail({
  cluster,
  onClose,
  onDelete,
}: {
  cluster: ComputeCluster;
  onClose: () => void;
  onDelete: () => void;
}) {
  const probeCluster = useProbeCluster();
  const { data: nodes = [], isLoading: nodesLoading } = useClusterNodes(
    cluster.id,
  );
  const [probeError, setProbeError] = useState("");

  const handleProbe = async () => {
    setProbeError("");
    try {
      await probeCluster.mutateAsync(cluster.id);
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
                <Badge
                  variant={statusBadgeVariant[cluster.status] ?? "outline"}
                >
                  {statusLabel[cluster.status] ?? cluster.status}
                </Badge>
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

        {/* Info fields */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <DetailField label="API Server" value={cluster.api_server_url || "—"} />
          <DetailField label="命名空间" value={cluster.namespace || "default"} />
          <DetailField
            label="最后探测"
            value={formatTime(cluster.last_probed_at)}
          />
          <DetailField label="创建时间" value={formatTime(cluster.created_at)} />
          <DetailField
            label="vLLM 镜像"
            value={cluster.vllm_image || "默认 (Docker Hub)"}
          />
        </div>

        {cluster.status_message && (
          <div className="mb-6 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {cluster.status_message}
          </div>
        )}

        {/* Resource cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <ResourceCard
            icon={HardDrive}
            label="GPU"
            value={`${cluster.gpu_available} / ${cluster.gpu_count}`}
            sub={cluster.gpu_type || "—"}
          />
          <ResourceCard
            icon={Cpu}
            label="CPU"
            value={formatCpu(cluster.cpu_total_millicores)}
            sub={`${cluster.node_count} 节点`}
          />
          <ResourceCard
            icon={MemoryStick}
            label="内存"
            value={formatBytes(cluster.memory_total_bytes)}
            sub=""
          />
        </div>

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
                        {node.gpu_count} x {node.gpu_type || "—"}
                      </TableCell>
                      <TableCell>{formatCpu(node.cpu_millicores)}</TableCell>
                      <TableCell>{formatBytes(node.memory_bytes)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            node.status === "Ready" ? "success" : "destructive"
                          }
                          className="text-[10px]"
                        >
                          {node.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {probeError && (
          <p className="text-sm text-destructive mb-3">{probeError}</p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handleProbe}
            disabled={probeCluster.isPending}
          >
            {probeCluster.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            探测集群
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            删除集群
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ResourceCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-sm font-semibold">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm mt-0.5 break-all">{value}</dd>
    </div>
  );
}

export default function ClustersPage() {
  const { data: clusters = [], isLoading } = useClusters();
  const createCluster = useCreateCluster();
  const deleteCluster = useDeleteCluster();

  const [selectedId, setSelectedId] = useState<string | null>(null);
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
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>
                        GPU {cluster.gpu_available}/{cluster.gpu_count}
                      </span>
                      <span>{cluster.node_count} 节点</span>
                    </div>
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
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">集群名称</Label>
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
              <Label className="text-xs">Kubeconfig</Label>
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
                  <SelectItem value="registry.cn-hangzhou.aliyuncs.com/modelscope-repo/vllm-openai:latest">
                    阿里云 (modelscope-repo)
                  </SelectItem>
                  <SelectItem value="swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/vllm/vllm-openai:latest">
                    华为云 (ddn-k8s)
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
                国内网络建议使用阿里云或华为云镜像加速 vLLM 部署
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

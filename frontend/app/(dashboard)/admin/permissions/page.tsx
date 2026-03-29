"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, ShieldCheck, X } from "lucide-react";
import {
  useRoleConfigs,
  usePermissionGroups,
  useCreatePermissionGroup,
  useDeletePermissionGroup,
  type RoleConfig,
} from "@/lib/hooks/use-permissions";
import { extractErrorDetail } from "@/lib/utils";
import { TableEmpty } from "@/components/table-states";
import { DeleteDialog } from "@/components/delete-dialog";
import type { PermissionGroup } from "@/lib/types";

// Permission display config: label + color class for the action type
const permInfo: Record<string, { label: string; action: string; color: string; hint?: string }> = {
  "datasets.read":     { label: "数据集", action: "查看", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  "datasets.write":    { label: "数据集", action: "编辑", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  "datasets.download": { label: "数据集", action: "下载", color: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  "models.read":       { label: "模型", action: "查看", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  "models.write":      { label: "模型", action: "编辑", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  "criteria.read":     { label: "评测标准", action: "查看", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  "criteria.write":    { label: "评测标准", action: "编辑", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  "tasks.read":        { label: "评测任务", action: "查看", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  "tasks.create":      { label: "评测任务", action: "创建", color: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  "tasks.manage":      { label: "评测任务", action: "管理", color: "bg-rose-500/15 text-rose-700 dark:text-rose-400", hint: "暂停、恢复、取消、重启、删除" },
  "results.read":      { label: "评测结果", action: "查看", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  "reports.read":      { label: "评测报告", action: "查看", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  "reports.generate":  { label: "评测报告", action: "生成", color: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  "reports.export":    { label: "评测报告", action: "导出", color: "bg-sky-500/15 text-sky-700 dark:text-sky-400", hint: "PDF、HTML、DOCX、CSV" },
  "clusters.read":     { label: "计算资源", action: "查看", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  "clusters.manage":   { label: "计算资源", action: "管理", color: "bg-rose-500/15 text-rose-700 dark:text-rose-400", hint: "添加、删除、探测集群" },
  "admin.users":       { label: "系统管理", action: "用户管理", color: "bg-rose-500/15 text-rose-700 dark:text-rose-400", hint: "创建、修改、删除用户" },
  "admin.groups":      { label: "系统管理", action: "权限组管理", color: "bg-rose-500/15 text-rose-700 dark:text-rose-400", hint: "创建、修改、删除权限组" },
  "admin.acl":         { label: "系统管理", action: "访问控制", color: "bg-rose-500/15 text-rose-700 dark:text-rose-400", hint: "资源级 ACL 访问控制列表" },
};

// Grouped by module
const permModules: { label: string; perms: string[] }[] = [
  { label: "数据集", perms: ["datasets.read", "datasets.write", "datasets.download"] },
  { label: "模型", perms: ["models.read", "models.write"] },
  { label: "评测标准", perms: ["criteria.read", "criteria.write"] },
  { label: "评测任务", perms: ["tasks.read", "tasks.create", "tasks.manage"] },
  { label: "结果与报告", perms: ["results.read", "reports.read", "reports.generate", "reports.export"] },
  { label: "计算资源", perms: ["clusters.read", "clusters.manage"] },
  { label: "系统管理", perms: ["admin.users", "admin.groups", "admin.acl"] },
];

/** Color legend for action types */
const actionColors: { action: string; color: string; desc: string }[] = [
  { action: "查看", color: "bg-emerald-500/15 text-emerald-700", desc: "只读访问" },
  { action: "下载/导出", color: "bg-sky-500/15 text-sky-700", desc: "下载或导出数据" },
  { action: "创建/生成", color: "bg-violet-500/15 text-violet-700", desc: "创建新资源" },
  { action: "编辑", color: "bg-amber-500/15 text-amber-700", desc: "修改已有资源" },
  { action: "管理", color: "bg-rose-500/15 text-rose-700", desc: "完全控制（增删改查）" },
];

type SelectedItem =
  | { type: "role"; data: RoleConfig }
  | { type: "group"; data: PermissionGroup };

export default function PermissionsPage() {
  const { data: roleConfigs = [] } = useRoleConfigs();
  const { data: permGroups = [] } = usePermissionGroups();
  const createGroup = useCreatePermissionGroup();
  const deleteGroup = useDeletePermissionGroup();

  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set());
  const [createError, setCreateError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const handleCreate = async () => {
    setCreateError("");
    try {
      await createGroup.mutateAsync({
        name: newName,
        description: newDesc || undefined,
        permissions: Array.from(newPerms),
      });
      setShowCreate(false);
      setNewName(""); setNewDesc(""); setNewPerms(new Set());
    } catch (err: unknown) {
      setCreateError(extractErrorDetail(err, "创建失败"));
    }
  };

  // Resolve permissions for the selected item
  const selectedPerms: string[] = selected
    ? selected.type === "role"
      ? selected.data.permissions
      : Array.isArray(selected.data.permissions) ? selected.data.permissions : []
    : [];

  return (
    <div className="flex gap-6 h-[calc(100vh-3.5rem-3rem)]">
      {/* Sidebar */}
      <div className="w-72 shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold">权限管理</h1>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            新建
          </Button>
        </div>

        <Card className="flex-1 overflow-hidden">
          <div className="overflow-auto h-full">
            {/* Preset roles */}
            <div className="px-2 pt-2 pb-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                预设角色
              </p>
              {roleConfigs.map((role) => (
                <button
                  key={role.name}
                  type="button"
                  onClick={() => setSelected({ type: "role", data: role })}
                  className={`w-full text-left rounded-md px-2.5 py-2 transition-colors ${
                    selected?.type === "role" && selected.data.name === role.name
                      ? "bg-muted"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium flex-1 truncate">{role.label}</span>
                    <Badge
                      variant={role.name === "admin" ? "default" : "outline"}
                      className="text-[9px] shrink-0"
                    >
                      {role.permissions.length}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom groups */}
            <div className="px-2 pt-2 pb-2 border-t mt-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                自定义权限组
              </p>
              {permGroups.length === 0 ? (
                <p className="text-[11px] text-muted-foreground px-2.5 py-3">
                  暂无权限组
                </p>
              ) : (
                permGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelected({ type: "group", data: g })}
                    className={`w-full text-left rounded-md px-2.5 py-2 transition-colors ${
                      selected?.type === "group" && selected.data.id === g.id
                        ? "bg-muted"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium flex-1 truncate">{g.name}</span>
                      {g.is_system && <Badge variant="outline" className="text-[9px]">系统</Badge>}
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {g.member_count} 人
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Detail panel */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <Card className="h-full overflow-auto">
            <CardContent className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">
                      {selected.type === "role" ? selected.data.label : selected.data.name}
                    </h2>
                    {selected.type === "role" ? (
                      <Badge variant={selected.data.name === "admin" ? "default" : "secondary"} className="text-[10px]">
                        预设角色
                      </Badge>
                    ) : (
                      <>
                        {(selected.data as PermissionGroup).is_system && (
                          <Badge variant="outline" className="text-[10px]">系统</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {(selected.data as PermissionGroup).member_count} 位成员
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selected.type === "role"
                      ? selected.data.description
                      : (selected.data as PermissionGroup).description || "无描述"
                    }
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {selected.type === "group" && !(selected.data as PermissionGroup).is_system && (
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget({
                        id: (selected.data as PermissionGroup).id,
                        name: (selected.data as PermissionGroup).name,
                      })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => setSelected(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Permissions by module */}
              {/* Color legend */}
              <div className="flex flex-wrap gap-2 mb-4">
                {actionColors.map((a) => (
                  <div key={a.action} className="flex items-center gap-1">
                    <span className={`inline-block h-2 w-2 rounded-full ${a.color.split(" ")[0]}`} />
                    <span className="text-[10px] text-muted-foreground">{a.action}</span>
                  </div>
                ))}
              </div>

              <h3 className="text-sm font-medium mb-3">
                权限列表
                <span className="text-muted-foreground font-normal ml-1.5">
                  ({selectedPerms.length} 项)
                </span>
              </h3>
              <div className="space-y-3">
                {permModules.map((mod) => {
                  const modPerms = mod.perms.filter((p) => selectedPerms.includes(p));
                  const allPerms = mod.perms;
                  return (
                    <div key={mod.label} className="rounded-md border p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium">{mod.label}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {modPerms.length}/{allPerms.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {allPerms.map((p) => {
                          const has = selectedPerms.includes(p);
                          const info = permInfo[p];
                          return (
                            <span
                              key={p}
                              title={info?.hint || `${info?.label} — ${info?.action}`}
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity ${
                                has
                                  ? info?.color || "bg-muted text-foreground"
                                  : "bg-muted/50 text-muted-foreground/30"
                              }`}
                            >
                              {info?.action || p}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Info for roles */}
              {selected.type === "role" && (
                <p className="text-[11px] text-muted-foreground mt-4">
                  预设角色的权限不可修改。如需自定义权限，请创建权限组并分配给用户。
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="h-full flex items-center justify-center">
            <TableEmpty icon={ShieldCheck} title="选择一个角色或权限组查看详情" />
          </Card>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>新建权限组</DialogTitle>
            <DialogDescription>选择权限并创建自定义权限组</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">名称<span className="text-destructive ml-0.5">*</span></Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="例：高级工程师" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">描述</Label>
              <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="可选描述" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">权限 ({newPerms.size} 项已选)</Label>
              <div className="rounded-md border p-3 space-y-3 max-h-56 overflow-auto">
                {permModules.map((mod) => (
                  <div key={mod.label}>
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">{mod.label}</p>
                    <div className="grid grid-cols-2 gap-1">
                      {mod.perms.map((perm) => {
                        const info = permInfo[perm];
                        return (
                          <label
                            key={perm}
                            className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:text-foreground"
                            title={info?.hint}
                          >
                            <input
                              type="checkbox"
                              checked={newPerms.has(perm)}
                              onChange={(e) => {
                                const next = new Set(newPerms);
                                if (e.target.checked) next.add(perm); else next.delete(perm);
                                setNewPerms(next);
                              }}
                              className="rounded"
                            />
                            {info?.action || perm}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button disabled={createGroup.isPending || !newName || newPerms.size === 0} onClick={handleCreate}>
              {createGroup.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <DeleteDialog
        open={!!deleteTarget}
        title="删除权限组"
        name={deleteTarget?.name ?? ""}
        isPending={deleteGroup.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteGroup.mutateAsync(deleteTarget.id);
          if (selected?.type === "group" && (selected.data as PermissionGroup).id === deleteTarget.id) {
            setSelected(null);
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

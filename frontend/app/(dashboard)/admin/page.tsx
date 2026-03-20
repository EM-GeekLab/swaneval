"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  Search,
  ShieldCheck,
  ShieldOff,
  Users,
  X,
} from "lucide-react";
import { TableEmpty, TableLoading } from "@/components/table-states";
import { extractErrorDetail } from "@/lib/utils";
import { useUsers, useUpdateUser, useDeleteUser } from "@/lib/hooks/use-users";
import { DeleteDialog } from "@/components/delete-dialog";
import { FilterDropdown } from "@/components/filter-dropdown";
import { utc } from "@/lib/utils";
import type { User } from "@/lib/types";

const roleLabel: Record<string, string> = {
  admin: "管理员",
  data_admin: "数据管理员",
  engineer: "工程师",
  viewer: "观察者",
};

const roleBadgeVariant: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  admin: "default",
  data_admin: "secondary",
  engineer: "outline",
  viewer: "outline",
};

export default function AdminPage() {
  const { data: users = [], isLoading } = useUsers();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [globalFilter, setGlobalFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("__all__");

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError("");
    try {
      await deleteUser.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      if (selectedUserId === deleteTarget.id) {
        setSelectedUserId(null);
      }
    } catch (err: unknown) {
      setDeleteError(extractErrorDetail(err, "删除失败"));
    }
  };

  const handleToggleActive = async (user: User) => {
    if (user.role === "admin") return;
    await updateUser.mutateAsync({
      id: user.id,
      is_active: !user.is_active,
    });
  };

  const handleRoleChange = async (user: User, newRole: string) => {
    if (user.role === "admin") return;
    await updateUser.mutateAsync({
      id: user.id,
      role: newRole,
    });
  };

  const filteredData = useMemo(() => {
    let result =
      roleFilter === "__all__"
        ? users
        : users.filter((u) => u.role === roleFilter);

    if (globalFilter.trim()) {
      const q = globalFilter.toLowerCase();
      result = result.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.nickname && u.nickname.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [users, roleFilter, globalFilter]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) {
      counts[u.role] = (counts[u.role] || 0) + 1;
    }
    return counts;
  }, [users]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  return (
    <div className="flex gap-6 h-[calc(100vh-3.5rem-3rem)]">
      {/* Sidebar */}
      <div className="w-80 shrink-0 flex flex-col">
        <div className="space-y-3 mb-3">
          {/* Title + count */}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold">用户管理</h1>
              <span className="text-xs text-base-content/50">
                共{" "}
                <span className="font-semibold text-base-content tabular-nums">
                  {users.length}
                </span>{" "}
                个用户
              </span>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-base-content/50" />
            <Input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="搜索用户名、邮箱..."
              className="pl-9 h-8 rounded-full text-xs"
            />
          </div>

          {/* Role filter */}
          <FilterDropdown
            label="角色"
            options={Object.entries(roleCounts).map(([role, count]) => ({
              key: role,
              label: roleLabel[role] ?? role,
              count,
            }))}
            value={roleFilter}
            onChange={setRoleFilter}
          />
        </div>

        {/* User list */}
        <Card className="flex-1 overflow-hidden">
          <div className="overflow-auto h-full">
            {isLoading ? (
              <TableLoading />
            ) : filteredData.length === 0 ? (
              users.length === 0 ? (
                <TableEmpty icon={Users} title="暂无用户" />
              ) : (
                <TableEmpty title="无匹配结果" />
              )
            ) : (
              <div className="p-1">
                {filteredData.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUserId(user.id)}
                    className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors ${
                      selectedUserId === user.id
                        ? "bg-base-200"
                        : "hover:bg-base-200/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate flex-1">
                        {user.username}
                      </span>
                      <Badge
                        variant={roleBadgeVariant[user.role]}
                        className="text-[10px] shrink-0"
                      >
                        {roleLabel[user.role]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                          user.is_active ? "bg-emerald-500" : "bg-red-400"
                        }`}
                      />
                      <span className="text-xs text-base-content/50 truncate">
                        {user.email}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Detail */}
      <div className="flex-1 min-w-0">
        {selectedUser ? (
          <Card className="h-full overflow-auto">
            <CardContent className="p-6">
              {/* Detail header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-base-200 flex items-center justify-center text-base-content/60 font-semibold text-lg">
                    {selectedUser.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">
                        {selectedUser.username}
                      </h2>
                      <Badge variant={roleBadgeVariant[selectedUser.role]}>
                        {roleLabel[selectedUser.role]}
                      </Badge>
                      <Badge
                        variant={
                          selectedUser.is_active ? "outline" : "destructive"
                        }
                        className="font-normal"
                      >
                        {selectedUser.is_active ? "活跃" : "已禁用"}
                      </Badge>
                    </div>
                    <p className="text-sm text-base-content/50 mt-0.5">
                      {selectedUser.email}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setSelectedUserId(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Detail fields */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <DetailField label="用户名" value={selectedUser.username} />
                  <DetailField
                    label="昵称"
                    value={selectedUser.nickname || "—"}
                  />
                  <DetailField label="邮箱" value={selectedUser.email} />
                  <DetailField
                    label="角色"
                    value={roleLabel[selectedUser.role] ?? selectedUser.role}
                  />
                  <DetailField
                    label="状态"
                    value={selectedUser.is_active ? "活跃" : "已禁用"}
                  />
                  <DetailField
                    label="创建时间"
                    value={
                      "created_at" in selectedUser
                        ? utc(
                            (selectedUser as User & { created_at?: string })
                              .created_at,
                          )?.toLocaleString("zh-CN") ?? "—"
                        : "—"
                    }
                  />
                </div>

                {/* Actions */}
                {selectedUser.role === "admin" ? (
                  <div className="pt-4 border-t">
                    <span className="text-xs text-base-content/30">
                      受保护
                    </span>
                  </div>
                ) : (
                  <div className="pt-4 border-t space-y-4">
                    {/* Role selector */}
                    <div>
                      <label className="text-xs font-medium text-base-content/60 mb-1.5 block">
                        修改角色
                      </label>
                      <Select
                        value={selectedUser.role}
                        onValueChange={(v) =>
                          handleRoleChange(selectedUser, v)
                        }
                      >
                        <SelectTrigger className="h-9 w-[200px] text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="data_admin">
                            数据管理员
                          </SelectItem>
                          <SelectItem value="engineer">工程师</SelectItem>
                          <SelectItem value="viewer">观察者</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(selectedUser)}
                      >
                        {selectedUser.is_active ? (
                          <>
                            <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                            禁用账号
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                            启用账号
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-error hover:text-error hover:bg-error/10 border-error/30"
                        onClick={() =>
                          setDeleteTarget({
                            id: selectedUser.id,
                            name: selectedUser.username,
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        删除用户
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="h-full flex items-center justify-center">
            <TableEmpty icon={Users} title="选择一个用户查看详情" />
          </Card>
        )}
      </div>

      {/* Delete confirmation */}
      <DeleteDialog
        open={!!deleteTarget}
        title="删除用户"
        name={deleteTarget?.name ?? ""}
        error={deleteError}
        isPending={deleteUser.isPending}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError("");
        }}
      />
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-base-content/50">{label}</dt>
      <dd className="text-sm mt-0.5">{value}</dd>
    </div>
  );
}

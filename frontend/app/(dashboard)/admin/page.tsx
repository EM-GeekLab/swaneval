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
  Plus,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { TableEmpty, TableLoading } from "@/components/table-states";
import { extractErrorDetail } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, useChangePassword, useUpdateUserTokens } from "@/lib/hooks/use-users";
import { DeleteDialog } from "@/components/delete-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterDropdown } from "@/components/filter-dropdown";
import { utc } from "@/lib/utils";
import type { User } from "@/lib/types";
import { useUrlSelection } from "@/lib/hooks/use-url-selection";

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
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const changePassword = useChangePassword();
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("engineer");
  const [createUserError, setCreateUserError] = useState("");

  const [selectedUserId, setSelectedUserId] = useUrlSelection("user");
  const [adminOldPw, setAdminOldPw] = useState("");
  const [adminNewPw, setAdminNewPw] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwError, setPwError] = useState("");
  const updateTokens = useUpdateUserTokens();
  const [adminHfToken, setAdminHfToken] = useState("");
  const [adminMsToken, setAdminMsToken] = useState("");
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
    if (user.username === "admin") return;
    await updateUser.mutateAsync({
      id: user.id,
      is_active: !user.is_active,
    });
  };

  const handleRoleChange = async (user: User, newRole: string) => {
    if (user.username === "admin") return;
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
              <span className="text-xs text-muted-foreground">
                共{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {users.length}
                </span>{" "}
                个用户
              </span>
              <Button size="sm" onClick={() => setShowCreateUser(true)}>
                <Plus className="h-4 w-4 mr-1" />
                添加用户
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                    className={`w-full text-left rounded-md px-3 py-2.5 transition-colors ${
                      selectedUserId === user.id
                        ? "bg-muted"
                        : "hover:bg-muted/50"
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
                          user.is_active ? "bg-emerald-500" : "bg-destructive"
                        }`}
                      />
                      <span className="text-xs text-muted-foreground truncate">
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
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-foreground/60 font-semibold text-lg">
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
                    <p className="text-sm text-muted-foreground mt-0.5">
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
                        ? formatTime(
                            (selectedUser as User & { created_at?: string })
                              .created_at,
                          )
                        : "—"
                    }
                  />
                </div>

                {/* API Tokens section */}
                <div className="pt-4 border-t space-y-2.5">
                  <p className="text-xs font-medium text-muted-foreground">API 令牌</p>
                  {selectedUser.username === "admin" ? (
                    <>
                      {[
                        { label: "HuggingFace", value: adminHfToken, set: setAdminHfToken, key: "hf_token" as const, masked: selectedUser.hf_token_masked },
                        { label: "ModelScope", value: adminMsToken, set: setAdminMsToken, key: "ms_token" as const, masked: selectedUser.ms_token_masked },
                      ].map((t) => (
                        <div key={t.key}>
                          <dt className="text-[11px] text-muted-foreground">{t.label}</dt>
                          <Input
                            type="password"
                            value={t.value}
                            onChange={(e) => t.set(e.target.value)}
                            onBlur={async () => {
                              if (!t.value) return;
                              try {
                                await updateTokens.mutateAsync({ [t.key]: t.value });
                                t.set("");
                              } catch { /* ignore */ }
                            }}
                            className="h-7 mt-0.5 max-w-xs text-xs font-mono"
                            placeholder={t.masked || "未配置"}
                          />
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">HuggingFace</dt>
                        <dd className="text-sm mt-0.5 font-mono">{selectedUser.hf_token_masked || "未配置"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">ModelScope</dt>
                        <dd className="text-sm mt-0.5 font-mono">{selectedUser.ms_token_masked || "未配置"}</dd>
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                {selectedUser.username === "admin" ? (
                  <div className="pt-4 border-t space-y-3">
                    <p className="text-xs font-medium text-foreground/60">修改密码</p>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-xs">旧密码</Label>
                        <Input type="password" value={adminOldPw} onChange={(e) => setAdminOldPw(e.target.value)} className="h-8 max-w-xs" autoComplete="current-password" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">新密码</Label>
                        <Input type="password" value={adminNewPw} onChange={(e) => setAdminNewPw(e.target.value)} className="h-8 max-w-xs" autoComplete="new-password" />
                      </div>
                    </div>
                    {pwError && <p className="text-xs text-destructive">{pwError}</p>}
                    {pwSuccess && <p className="text-xs text-emerald-600">{pwSuccess}</p>}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={changePassword.isPending || !adminOldPw || !adminNewPw}
                      onClick={async () => {
                        setPwError(""); setPwSuccess("");
                        try {
                          await changePassword.mutateAsync({ old_password: adminOldPw, new_password: adminNewPw });
                          setPwSuccess("密码修改成功");
                          setAdminOldPw(""); setAdminNewPw("");
                          setTimeout(() => setPwSuccess(""), 3000);
                        } catch (err: unknown) {
                          setPwError(extractErrorDetail(err, "密码修改失败"));
                        }
                      }}
                    >
                      {changePassword.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      修改密码
                    </Button>
                  </div>
                ) : (
                  <div className="pt-4 border-t space-y-4">
                    {/* Role selector */}
                    <div>
                      <label className="text-xs font-medium text-foreground/60 mb-1.5 block">
                        修改角色
                      </label>
                      <Select
                        value={selectedUser.role}
                        onValueChange={(v) =>
                          handleRoleChange(selectedUser, v)
                        }
                        disabled={selectedUser.username === "admin"}
                      >
                        <SelectTrigger className="h-9 w-[200px] text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">管理员</SelectItem>
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
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
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

      {/* Create user dialog */}
      <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加用户</DialogTitle>
            <DialogDescription>创建一个新的平台用户</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">用户名<span className="text-destructive ml-0.5">*</span></Label>
              <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="username" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">邮箱<span className="text-destructive ml-0.5">*</span></Label>
              <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">密码<span className="text-destructive ml-0.5">*</span></Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="至少 6 个字符" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">角色</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="data_admin">数据管理员</SelectItem>
                  <SelectItem value="engineer">工程师</SelectItem>
                  <SelectItem value="viewer">观察者</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createUserError && <p className="text-sm text-destructive">{createUserError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateUser(false)}>取消</Button>
            <Button
              disabled={createUser.isPending || !newUsername || !newEmail || !newPassword}
              onClick={async () => {
                setCreateUserError("");
                try {
                  await createUser.mutateAsync({
                    username: newUsername, email: newEmail,
                    password: newPassword, role: newRole,
                  });
                  setShowCreateUser(false);
                  setNewUsername(""); setNewEmail(""); setNewPassword(""); setNewRole("engineer");
                } catch (err: unknown) {
                  setCreateUserError(extractErrorDetail(err, "创建失败"));
                }
              }}
            >
              {createUser.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm mt-0.5">{value}</dd>
    </div>
  );
}

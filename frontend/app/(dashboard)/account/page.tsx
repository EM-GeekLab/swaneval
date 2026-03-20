"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import { extractErrorDetail } from "@/lib/utils";
import { useUpdateProfile, useChangePassword, useUserTokens, useUpdateUserTokens } from "@/lib/hooks/use-users";

export default function AccountPage() {
  const { user } = useAuthStore();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const { data: tokenStatus } = useUserTokens();
  const updateTokens = useUpdateUserTokens();

  const [nickname, setNickname] = useState(user?.nickname || "");
  const [email, setEmail] = useState(user?.email || "");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwError, setPwError] = useState("");

  const [hfToken, setHfToken] = useState("");
  const [msToken, setMsToken] = useState("");
  const [tokenSuccess, setTokenSuccess] = useState("");
  const [tokenError, setTokenError] = useState("");

  const handleSaveProfile = async () => {
    setProfileError("");
    setProfileSuccess("");
    try {
      const updated = await updateProfile.mutateAsync({ nickname, email });
      const stored = localStorage.getItem("user");
      if (stored) {
        const parsed = JSON.parse(stored);
        localStorage.setItem("user", JSON.stringify({ ...parsed, ...updated }));
      }
      setProfileSuccess("保存成功");
      setTimeout(() => setProfileSuccess(""), 3000);
    } catch (err: unknown) {
      setProfileError(extractErrorDetail(err, "保存失败"));
    }
  };

  const handleChangePassword = async () => {
    setPwError("");
    setPwSuccess("");
    if (!oldPassword || !newPassword) {
      setPwError("请填写旧密码和新密码");
      return;
    }
    try {
      await changePassword.mutateAsync({
        old_password: oldPassword,
        new_password: newPassword,
      });
      setPwSuccess("密码修改成功");
      setOldPassword("");
      setNewPassword("");
      setTimeout(() => setPwSuccess(""), 3000);
    } catch (err: unknown) {
      setPwError(extractErrorDetail(err, "密码修改失败"));
    }
  };

  const handleSaveTokens = async () => {
    setTokenError(""); setTokenSuccess("");
    const payload: Record<string, string> = {};
    if (hfToken) payload.hf_token = hfToken;
    if (msToken) payload.ms_token = msToken;
    if (Object.keys(payload).length === 0) {
      setTokenError("请输入至少一个令牌");
      return;
    }
    try {
      await updateTokens.mutateAsync(payload);
      setTokenSuccess("令牌保存成功");
      setHfToken(""); setMsToken("");
      setTimeout(() => setTokenSuccess(""), 3000);
    } catch (err: unknown) {
      setTokenError(extractErrorDetail(err, "保存失败"));
    }
  };

  const handleClearTokens = async () => {
    setTokenError(""); setTokenSuccess("");
    try {
      await updateTokens.mutateAsync({ hf_token: "", ms_token: "" });
      setTokenSuccess("令牌已清除");
      setTimeout(() => setTokenSuccess(""), 3000);
    } catch (err: unknown) {
      setTokenError(extractErrorDetail(err, "清除失败"));
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold">账号设置</h1>
        <p className="text-sm text-muted-foreground mt-1">管理您的个人信息和密码。</p>
      </div>

      {/* Profile */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">个人信息</h2>
            <Badge variant="outline">{user.role}</Badge>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="acc-username" className="text-xs">用户名</Label>
              <Input id="acc-username" value={user.username} disabled className="h-9 bg-muted/50" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="acc-nickname" className="text-xs">昵称</Label>
              <Input id="acc-nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} className="h-9" placeholder="设置昵称" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="acc-email" className="text-xs">邮箱</Label>
              <Input id="acc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
            </div>
          </div>
          {profileError && <p className="text-xs text-destructive">{profileError}</p>}
          {profileSuccess && <p className="text-xs text-emerald-600">{profileSuccess}</p>}
          <Button size="sm" onClick={handleSaveProfile} disabled={updateProfile.isPending}>
            {updateProfile.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            保存
          </Button>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="text-sm font-medium">修改密码</h2>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="acc-old-pw" className="text-xs">旧密码</Label>
              <Input id="acc-old-pw" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="h-9 max-w-xs" autoComplete="current-password" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="acc-new-pw" className="text-xs">新密码</Label>
              <Input id="acc-new-pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-9 max-w-xs" autoComplete="new-password" />
            </div>
          </div>
          {pwError && <p className="text-xs text-destructive">{pwError}</p>}
          {pwSuccess && <p className="text-xs text-emerald-600">{pwSuccess}</p>}
          <Button size="sm" variant="outline" onClick={handleChangePassword} disabled={changePassword.isPending}>
            {changePassword.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            修改密码
          </Button>
        </CardContent>
      </Card>

      {/* API Tokens */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div>
            <h2 className="text-sm font-medium">API 令牌</h2>
            <p className="text-xs text-muted-foreground mt-1">
              配置数据集平台令牌以下载需要认证的数据集。管理员可在环境变量中设置默认令牌。
            </p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="acc-hf-token" className="text-xs">
                HuggingFace Token
                {tokenStatus?.hf_token_set && (
                  <Badge variant="success" className="ml-2 text-[10px]">已配置</Badge>
                )}
              </Label>
              <Input
                id="acc-hf-token"
                type="password"
                value={hfToken}
                onChange={(e) => setHfToken(e.target.value)}
                className="h-9 max-w-xs font-mono"
                placeholder={tokenStatus?.hf_token_set ? "已设置，输入新值替换" : "hf_..."}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="acc-ms-token" className="text-xs">
                ModelScope Token
                {tokenStatus?.ms_token_set && (
                  <Badge variant="success" className="ml-2 text-[10px]">已配置</Badge>
                )}
              </Label>
              <Input
                id="acc-ms-token"
                type="password"
                value={msToken}
                onChange={(e) => setMsToken(e.target.value)}
                className="h-9 max-w-xs font-mono"
                placeholder={tokenStatus?.ms_token_set ? "已设置，输入新值替换" : "输入 ModelScope Token"}
              />
            </div>
          </div>
          {tokenError && <p className="text-xs text-destructive">{tokenError}</p>}
          {tokenSuccess && <p className="text-xs text-emerald-600">{tokenSuccess}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveTokens} disabled={updateTokens.isPending}>
              {updateTokens.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              保存令牌
            </Button>
            {(tokenStatus?.hf_token_set || tokenStatus?.ms_token_set) && (
              <Button size="sm" variant="outline" onClick={handleClearTokens} disabled={updateTokens.isPending}>
                清除令牌
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

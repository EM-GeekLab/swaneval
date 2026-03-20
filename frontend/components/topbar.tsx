"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  Cpu,
  PlayCircle,
  BarChart3,
  Ruler,
  LogOut,
  Users,
  Loader2,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import { cn, extractErrorDetail } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useUpdateProfile, useChangePassword } from "@/lib/hooks/use-users";

const nav = [
  { href: "/", label: "概览", icon: LayoutDashboard },
  { href: "/models", label: "模型", icon: Cpu },
  { href: "/datasets", label: "数据集", icon: Database },
  { href: "/criteria", label: "评估标准", icon: Ruler },
  { href: "/tasks", label: "评测任务", icon: PlayCircle },
  { href: "/results", label: "结果分析", icon: BarChart3 },
];

const adminNav = { href: "/admin", label: "用户管理", icon: Users };

export function Topbar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const accountBtnRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(null);

  const allNav = user?.role === "admin" ? [...nav, adminNav] : nav;

  const openSettings = () => {
    if (accountBtnRef.current) {
      const rect = accountBtnRef.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setSettingsOpen(true);
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-base-200/95 backdrop-blur supports-[backdrop-filter]:bg-base-200/60">
        <div className="flex h-14 items-center px-6 gap-6">
          <Link href="/" className="shrink-0 mr-2 flex items-center gap-2 text-primary">
            <Logo className="h-5 w-5" />
            <span className="text-base font-bold tracking-tight">SwanEVAL</span>
          </Link>

          <nav className="flex items-center gap-1 flex-1">
            {allNav.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all duration-150 whitespace-nowrap",
                    active
                      ? "bg-base-100 text-base-content font-medium shadow-sm"
                      : "text-base-content/40 hover:bg-base-200/50 hover:text-base-content"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {user && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                ref={accountBtnRef}
                onClick={openSettings}
                className="hidden sm:flex items-center gap-2 rounded-lg px-3 py-1.5 text-right cursor-pointer hover:bg-base-200/60 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium leading-none">{user.nickname || user.username}</p>
                  <p className="text-[11px] text-base-content/40 mt-0.5">{user.role}</p>
                </div>
              </button>
              <button
                onClick={() => {
                  logout();
                  window.location.href = "/login";
                }}
                className="rounded-lg p-2 text-base-content/40 hover:bg-base-200/60 hover:text-base-content transition-colors"
                title="退出登录"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {user && settingsOpen && (
        <AccountSettingsPanel
          position={panelPos}
          onClose={() => setSettingsOpen(false)}
          user={user}
        />
      )}
    </>
  );
}

function AccountSettingsPanel({
  position,
  onClose,
  user,
}: {
  position: { top: number; right: number } | null;
  onClose: () => void;
  user: { username: string; nickname: string; email: string; role: string };
}) {
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  const [nickname, setNickname] = useState(user.nickname || "");
  const [email, setEmail] = useState(user.email || "");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwError, setPwError] = useState("");

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

  if (!position) return null;

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-0 z-50 animate-backdrop-in"
          onClick={onClose}
        />,
        document.body,
      )}
      <div
        className="fixed z-[60] animate-modal-expand"
        style={{
          top: position.top,
          right: position.right,
          transformOrigin: "top right",
        }}
      >
        <Card className="w-[360px] shadow-2xl rounded-2xl">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-sm font-semibold">账号设置</h3>
          </div>
          <CardContent className="pt-0 max-h-[70vh] overflow-auto space-y-5">
            {/* Profile */}
            <div className="space-y-3">
              <p className="text-xs text-base-content/40 font-medium">个人信息</p>
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <Label htmlFor="s-username" className="text-xs">用户名</Label>
                  <Input id="s-username" value={user.username} disabled className="h-9 bg-base-200/50" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s-nickname" className="text-xs">昵称</Label>
                  <Input id="s-nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} className="h-9" placeholder="设置昵称" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s-email" className="text-xs">邮箱</Label>
                  <Input id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
                </div>
              </div>
              {profileError && <p className="text-xs text-error">{profileError}</p>}
              {profileSuccess && <p className="text-xs text-emerald-600">{profileSuccess}</p>}
              <Button size="sm" onClick={handleSaveProfile} disabled={updateProfile.isPending}>
                {updateProfile.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                保存
              </Button>
            </div>

            <div className="border-t border-base-300/50" />

            {/* Password */}
            <div className="space-y-3">
              <p className="text-xs text-base-content/40 font-medium">修改密码</p>
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <Label htmlFor="s-old-pw" className="text-xs">旧密码</Label>
                  <Input id="s-old-pw" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="h-9" autoComplete="current-password" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s-new-pw" className="text-xs">新密码</Label>
                  <Input id="s-new-pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-9" autoComplete="new-password" />
                </div>
              </div>
              {pwError && <p className="text-xs text-error">{pwError}</p>}
              {pwSuccess && <p className="text-xs text-emerald-600">{pwSuccess}</p>}
              <Button size="sm" variant="outline" onClick={handleChangePassword} disabled={changePassword.isPending}>
                {changePassword.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                修改密码
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import api from "@/lib/api";
import type { TokenResponse, User } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [regForm, setRegForm] = useState({
    username: "",
    email: "",
    password: "",
  });

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("token")) {
      router.replace("/");
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data: tokenData } = await api.post<TokenResponse>(
        "/auth/login",
        loginForm
      );
      localStorage.setItem("token", tokenData.access_token);
      const { data: user } = await api.get<User>("/auth/me");
      localStorage.setItem("user", JSON.stringify(user));
      window.location.href = "/";
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response
              ?.data?.detail
          : undefined;
      setError(detail || "用户名或密码错误");
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await api.post("/auth/register", { ...regForm, role: "engineer" });
      setSuccess("账号创建成功，请在下方登录。");
      setMode("login");
      setLoginForm({
        username: regForm.username,
        password: regForm.password,
      });
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response
              ?.data?.detail
          : undefined;
      setError(detail || "注册失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:block lg:w-1/2 login-bg">
        <div className="blob" />
        <div className="relative z-10 flex flex-col justify-end h-full p-10">
          <div className="flex items-center gap-3">
            <Logo className="h-10 w-10 text-white/70" />
            <div>
              <h1 className="text-3xl font-bold text-white/90 tracking-tight leading-none">
                SwanEVAL
              </h1>
              <p className="text-xs text-white/40 mt-1 leading-none">
                AI Model Evaluation
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex items-center gap-2.5">
            <Logo className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight leading-none">SwanEVAL</h1>
              <p className="text-xs text-muted-foreground mt-0.5">AI Model Evaluation</p>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {mode === "login" ? "登录" : "创建账号"}
            </h2>
            <p className="text-muted-foreground mt-1">
              {mode === "login"
                ? "输入您的凭据以继续。"
                : "注册新账号以开始使用。"}
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="username">用户名</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  value={loginForm.username}
                  onChange={(e) =>
                    setLoginForm({ ...loginForm, username: e.target.value })
                  }
                  className="h-10 focus-visible:ring-primary/40"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={loginForm.password}
                  onChange={(e) =>
                    setLoginForm({ ...loginForm, password: e.target.value })
                  }
                  className="h-10 focus-visible:ring-primary/40"
                  required
                />
              </div>
              <Button type="submit" className="w-full h-10" disabled={loading}>
                {loading ? "登录中..." : "登录"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                还没有账号？{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError("");
                    setSuccess("");
                  }}
                  className="text-primary font-medium hover:underline underline-offset-4"
                >
                  注册
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="reg-user">用户名</Label>
                <Input
                  id="reg-user"
                  autoComplete="username"
                  value={regForm.username}
                  onChange={(e) =>
                    setRegForm({ ...regForm, username: e.target.value })
                  }
                  className="h-10 focus-visible:ring-primary/40"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-email">邮箱</Label>
                <Input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  value={regForm.email}
                  onChange={(e) =>
                    setRegForm({ ...regForm, email: e.target.value })
                  }
                  className="h-10 focus-visible:ring-primary/40"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-pass">密码</Label>
                <Input
                  id="reg-pass"
                  type="password"
                  autoComplete="new-password"
                  value={regForm.password}
                  onChange={(e) =>
                    setRegForm({ ...regForm, password: e.target.value })
                  }
                  className="h-10 focus-visible:ring-primary/40"
                  required
                />
              </div>
              <Button type="submit" className="w-full h-10" disabled={loading}>
                {loading ? "创建中..." : "创建账号"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                已有账号？{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError("");
                    setSuccess("");
                  }}
                  className="text-primary font-medium hover:underline underline-offset-4"
                >
                  登录
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

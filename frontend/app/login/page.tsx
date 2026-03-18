"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLogin, useRegister, useMe } from "@/lib/hooks/use-auth";
import { useAuthStore } from "@/lib/stores/auth";

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const login = useLogin();
  const register = useRegister();
  const me = useMe();

  const [tab, setTab] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [regForm, setRegForm] = useState({
    username: "",
    email: "",
    password: "",
    role: "engineer" as const,
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const tokenData = await login.mutateAsync(loginForm);
      localStorage.setItem("token", tokenData.access_token);
      const user = await me.mutateAsync();
      setAuth(tokenData.access_token, user);
      router.replace("/");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setError(msg || "Login failed");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await register.mutateAsync(regForm);
      setTab("login");
      setLoginForm({ username: regForm.username, password: regForm.password });
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setError(msg || "Registration failed");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-center text-lg">EvalScope</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => { setTab(v as "login" | "register"); setError(""); }}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            {error && (
              <div className="mb-3 rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="l-user">Username</Label>
                  <Input
                    id="l-user"
                    value={loginForm.username}
                    onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="l-pass">Password</Label>
                  <Input
                    id="l-pass"
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={login.isPending || me.isPending}>
                  {login.isPending || me.isPending ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="r-user">Username</Label>
                  <Input
                    id="r-user"
                    value={regForm.username}
                    onChange={(e) => setRegForm({ ...regForm, username: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="r-email">Email</Label>
                  <Input
                    id="r-email"
                    type="email"
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="r-pass">Password</Label>
                  <Input
                    id="r-pass"
                    type="password"
                    value={regForm.password}
                    onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={register.isPending}>
                  {register.isPending ? "Creating..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Server,
  ShieldCheck,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import { useUserPermissions } from "@/lib/hooks/use-user-permissions";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; perm: string | null };

// Nav groups: overview | resources | evaluation | analysis | infra
// Separators rendered between groups
const navGroups: { items: NavItem[]; }[] = [
  // Overview
  { items: [
    { href: "/", label: "概览", icon: LayoutDashboard, perm: null },
  ]},
  // Resources
  { items: [
    { href: "/models", label: "模型", icon: Cpu, perm: "models.read" },
    { href: "/datasets", label: "数据集", icon: Database, perm: "datasets.read" },
    { href: "/criteria", label: "评估标准", icon: Ruler, perm: "criteria.read" },
  ]},
  // Evaluation & Analysis
  { items: [
    { href: "/tasks", label: "评测任务", icon: PlayCircle, perm: "tasks.read" },
    { href: "/results", label: "结果分析", icon: BarChart3, perm: "results.read" },
  ]},
  // Infrastructure
  { items: [
    { href: "/clusters", label: "计算资源", icon: Server, perm: "clusters.read" },
  ]},
];

// Admin-only items — rendered right-aligned
const adminNav: NavItem[] = [
  { href: "/admin", label: "用户管理", icon: Users, perm: null },
  { href: "/admin/permissions", label: "权限管理", icon: ShieldCheck, perm: null },
];

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { can } = useUserPermissions();

  // Filter each group by permission, drop empty groups
  const visibleGroups = navGroups
    .map(g => g.items.filter(item => item.perm === null || can(item.perm)))
    .filter(items => items.length > 0);

  const visibleAdmin = user?.role === "admin" ? adminNav : [];

  const handleAccountClick = () => {
    if (user?.role === "admin") {
      router.push(`/admin?user=${user.id}`);
    } else {
      router.push("/account");
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-6 gap-6">
        <Link href="/" className="shrink-0 mr-2 flex items-center gap-2 text-primary">
          <Logo className="h-5 w-5" />
          <span className="text-base font-bold tracking-tight">SwanEVAL</span>
        </Link>

        <nav className="flex items-center flex-1">
          {visibleGroups.map((items, gi) => (
            <div key={gi} className="flex items-center">
              {gi > 0 && (
                <div className="w-px h-4 bg-border mx-1.5 shrink-0" />
              )}
              <div className="flex items-center gap-0.5">
                {items.map((item) => {
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-all duration-150 whitespace-nowrap",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Spacer pushes admin items to the right */}
          <div className="flex-1" />

          {visibleAdmin.length > 0 && (
            <div className="flex items-center gap-0.5">
              {visibleAdmin.map((item) => {
                // Exact match for /admin (don't highlight on /admin/permissions)
                const active = item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-all duration-150 whitespace-nowrap",
                      active
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {user && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleAccountClick}
              className="hidden sm:flex items-center gap-2 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-accent/50 transition-colors"
            >
              <div className="text-right">
                <p className="text-sm font-medium leading-none">{user.nickname || user.username}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{user.role}</p>
              </div>
            </button>
            <ThemeToggle />
            <button
              onClick={() => {
                logout();
                window.location.href = "/login";
              }}
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
              title="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

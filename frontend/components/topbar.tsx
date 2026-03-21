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
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import { useUserPermissions } from "@/lib/hooks/use-user-permissions";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const navWithPerms: { href: string; label: string; icon: typeof LayoutDashboard; perm: string | null }[] = [
  { href: "/", label: "概览", icon: LayoutDashboard, perm: null },
  { href: "/models", label: "模型", icon: Cpu, perm: "models.read" },
  { href: "/datasets", label: "数据集", icon: Database, perm: "datasets.read" },
  { href: "/criteria", label: "评估标准", icon: Ruler, perm: "criteria.read" },
  { href: "/tasks", label: "评测任务", icon: PlayCircle, perm: "tasks.read" },
  { href: "/results", label: "结果分析", icon: BarChart3, perm: "results.read" },
  { href: "/clusters", label: "计算资源", icon: Server, perm: "clusters.read" },
];

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { can } = useUserPermissions();

  const allNav = navWithPerms.filter(
    (item) => item.perm === null || can(item.perm)
  );

  if (user?.role === "admin") {
    allNav.push({ href: "/admin", label: "用户管理", icon: Users, perm: null });
  }

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

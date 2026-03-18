"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  Cpu,
  PlayCircle,
  BarChart3,
  LogOut,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "概览", sub: "Dashboard", icon: LayoutDashboard },
  { href: "/models", label: "模型", sub: "Models", icon: Cpu },
  { href: "/datasets", label: "数据集", sub: "Datasets", icon: Database },
  { href: "/tasks", label: "评测任务", sub: "Evaluations", icon: PlayCircle },
  { href: "/results", label: "结果分析", sub: "Results", icon: BarChart3 },
];

export function Topbar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-6 gap-6">
        <Link href="/" className="shrink-0 mr-2">
          <span className="text-base font-bold tracking-tight">EvalScope</span>
        </Link>

        <nav className="flex items-center gap-1 flex-1">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors whitespace-nowrap",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
                <span className="hidden lg:inline text-xs opacity-50">
                  {item.sub}
                </span>
              </Link>
            );
          })}
        </nav>

        {user && (
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium leading-none">{user.username}</p>
              <p className="text-xs text-muted-foreground">{user.role}</p>
            </div>
            <button
              onClick={() => {
                logout();
                window.location.href = "/login";
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

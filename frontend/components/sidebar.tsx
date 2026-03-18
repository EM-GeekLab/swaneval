"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  Ruler,
  Cpu,
  PlayCircle,
  BarChart3,
  LogOut,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/datasets", label: "Datasets", icon: Database },
  { href: "/criteria", label: "Criteria", icon: Ruler },
  { href: "/models", label: "Models", icon: Cpu },
  { href: "/tasks", label: "Tasks", icon: PlayCircle },
  { href: "/results", label: "Results", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-card">
      <div className="flex h-12 items-center border-b px-4">
        <span className="text-sm font-semibold tracking-tight">EvalScope</span>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
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
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {user && (
        <div className="border-t p-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.username}</p>
              <p className="truncate text-xs text-muted-foreground">{user.role}</p>
            </div>
            <button
              onClick={() => {
                logout();
                window.location.href = "/login";
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

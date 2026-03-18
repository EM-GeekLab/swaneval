"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { useAuthStore } from "@/lib/stores/auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { token, hydrate } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrate();
    setReady(true);
  }, [hydrate]);

  useEffect(() => {
    if (ready && !token && !localStorage.getItem("token")) {
      router.replace("/login");
    }
  }, [ready, token, router]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { useAuthStore } from "@/lib/stores/auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { hydrate } = useAuthStore();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    hydrate();
    setAuthed(true);
  }, [hydrate, router]);

  if (!authed) {
    return null;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Topbar />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";

export function useUserPermissions() {
  const user = useAuthStore((s) => s.user);

  const { data: permissions = [] } = useQuery({
    queryKey: ["permissions", "mine"],
    queryFn: async () => {
      const res = await api.get<{ permissions: string[] }>("/permissions/my-permissions");
      return res.data.permissions;
    },
    enabled: !!user,
    staleTime: 60_000, // cache for 1 minute
  });

  const can = (perm: string): boolean => {
    if (user?.role === "admin") return true;
    return permissions.includes(perm);
  };

  const canAny = (...perms: string[]): boolean => {
    if (user?.role === "admin") return true;
    return perms.some((p) => permissions.includes(p));
  };

  return { permissions, can, canAny, isAdmin: user?.role === "admin" };
}

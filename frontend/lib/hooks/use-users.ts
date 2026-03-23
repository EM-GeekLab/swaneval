import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { User } from "@/lib/types";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await api.get<User[]>("/users");
      return res.data;
    },
    staleTime: 60_000,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { nickname?: string; email?: string }) => {
      const res = await api.put<User>("/auth/me", data);
      return res.data;
    },
    onSuccess: (user) => {
      localStorage.setItem("user", JSON.stringify(user));
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (data: { old_password: string; new_password: string }) => {
      await api.post("/auth/change-password", data);
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      id: string;
      nickname?: string;
      email?: string;
      role?: string;
      is_active?: boolean;
    }) => {
      const { id, ...body } = data;
      const res = await api.put<User>(`/users/${id}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/users/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUserTokens() {
  return useQuery({
    queryKey: ["user-tokens"],
    queryFn: async () => {
      const res = await api.get<{ hf_token_set: boolean; ms_token_set: boolean }>("/auth/tokens");
      return res.data;
    },
    staleTime: 60_000,
  });
}

export function useUpdateUserTokens() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { hf_token?: string; ms_token?: string }) => {
      const res = await api.put<{ hf_token_set: boolean; ms_token_set: boolean }>("/auth/tokens", data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-tokens"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUserCount() {
  return useQuery({
    queryKey: ["user-count"],
    queryFn: async () => {
      const res = await api.get<{ count: number }>("/auth/user-count");
      return res.data.count;
    },
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { PermissionGroup, ResourceAcl } from "@/lib/types";

export interface RoleConfig {
  name: string;
  label: string;
  description: string;
  permissions: string[];
  is_preset: boolean;
}

export function useRoleConfigs() {
  return useQuery({
    queryKey: ["permissions", "roles"],
    queryFn: async () => {
      const res = await api.get<RoleConfig[]>("/permissions/roles");
      return res.data;
    },
    staleTime: 120_000,
  });
}

export function usePermissionGroups() {
  return useQuery({
    queryKey: ["permission-groups"],
    queryFn: async () => {
      const res = await api.get<PermissionGroup[]>("/permissions/groups");
      return res.data;
    },
    staleTime: 120_000,
  });
}

export function useCreatePermissionGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; permissions: string[] }) => {
      const res = await api.post<PermissionGroup>("/permissions/groups", data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permission-groups"] }),
  });
}

export function useUpdatePermissionGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { id: string; name?: string; description?: string; permissions?: string[] }) => {
      const { id, ...body } = data;
      const res = await api.put<PermissionGroup>(`/permissions/groups/${id}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permission-groups"] }),
  });
}

export function useDeletePermissionGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await api.delete(`/permissions/groups/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permission-groups"] }),
  });
}

export function useAddGroupMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { groupId: string; user_ids: string[] }) => {
      await api.post(`/permissions/groups/${data.groupId}/members`, { user_ids: data.user_ids });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permission-groups"] }),
  });
}

export function useRemoveGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { groupId: string; userId: string }) => {
      await api.delete(`/permissions/groups/${data.groupId}/members/${data.userId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permission-groups"] }),
  });
}

export function useMyPermissions() {
  return useQuery({
    queryKey: ["my-permissions"],
    queryFn: async () => {
      const res = await api.get<{ permissions: string[]; groups: string[] }>("/permissions/my-permissions");
      return res.data;
    },
  });
}

export function useResourceAcls(resourceType?: string, resourceId?: string) {
  return useQuery({
    queryKey: ["acls", resourceType, resourceId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (resourceType) params.resource_type = resourceType;
      if (resourceId) params.resource_id = resourceId;
      const res = await api.get<ResourceAcl[]>("/permissions/acls", { params });
      return res.data;
    },
    staleTime: 120_000,
  });
}

export function useCreateAcl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { resource_type: string; resource_id: string; grantee_type: string; grantee_id: string; access_level: string }) => {
      const res = await api.post<ResourceAcl>("/permissions/acls", data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["acls"] }),
  });
}

export function useDeleteAcl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await api.delete(`/permissions/acls/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["acls"] }),
  });
}

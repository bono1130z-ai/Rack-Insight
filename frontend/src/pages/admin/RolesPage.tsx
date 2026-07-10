import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Lock, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { PermissionGate } from "@/components/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { usePermissions, useRoles } from "@/hooks/queries";
import { api, ApiError } from "@/services/api";
import { toast } from "@/stores/toast";
import type { Permission, Role } from "@/types";

interface RoleForm {
  name: string;
  description: string;
  permission_codes: string[];
}

const EMPTY_FORM: RoleForm = { name: "", description: "", permission_codes: [] };

export function RolesPage() {
  const { data: roles, isLoading } = useRoles();
  const { data: permissions } = usePermissions();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const [form, setForm] = useState<RoleForm>(EMPTY_FORM);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["roles"] });

  const permsByCategory = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const perm of permissions ?? []) {
      const list = map.get(perm.category) ?? [];
      list.push(perm);
      map.set(perm.category, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditing(role);
    setForm({
      name: role.name,
      description: role.description ?? "",
      permission_codes: role.permission_codes,
    });
    setDialogOpen(true);
  };

  const togglePermission = (code: string) =>
    setForm((f) => ({
      ...f,
      permission_codes: f.permission_codes.includes(code)
        ? f.permission_codes.filter((c) => c !== code)
        : [...f.permission_codes, code],
    }));

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        description: form.description || null,
        permission_codes: form.permission_codes,
      };
      return editing ? api.updateRole(editing.id, payload) : api.createRole(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Role updated" : "Role created", form.name);
      setDialogOpen(false);
      invalidate();
    },
    onError: (err) =>
      toast.error("Save failed", err instanceof ApiError ? err.message : "Unexpected error"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteRole(id),
    onSuccess: () => {
      toast.success("Role deleted", deleting?.name);
      setDeleting(null);
      invalidate();
    },
    onError: (err) =>
      toast.error("Delete failed", err instanceof ApiError ? err.message : "Unexpected error"),
  });

  const columns = useMemo<ColumnDef<Role, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Role",
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium">
            {row.original.name}
            {row.original.is_system && (
              <Badge variant="muted">
                <Lock className="h-3 w-3" /> System
              </Badge>
            )}
          </span>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: (c) => (c.getValue() as string) || "-",
      },
      {
        id: "permissions",
        header: "Permissions",
        cell: ({ row }) => (
          <Badge variant="default">{row.original.permission_codes.length}</Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <PermissionGate permission="role.update">
              <Button
                variant="ghost"
                size="icon"
                disabled={row.original.is_system}
                title={row.original.is_system ? "System roles are read-only" : "Edit"}
                onClick={() => openEdit(row.original)}
              >
                <Pencil className="h-4 w-4 text-gray-500" />
              </Button>
            </PermissionGate>
            <PermissionGate permission="role.delete">
              <Button
                variant="ghost"
                size="icon"
                disabled={row.original.is_system}
                onClick={() => setDeleting(row.original)}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </PermissionGate>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb crumbs={[{ label: "Access Management" }, { label: "Roles" }]} />

      <DataTable
        data={roles ?? []}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search roles…"
        toolbar={
          <PermissionGate permission="role.create">
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Create Role
            </Button>
          </PermissionGate>
        }
        emptyState={
          <EmptyState
            Icon={ShieldCheck}
            title="No roles"
            description="Roles bundle permissions. Bind them to user groups to grant access."
          />
        }
      />

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? `Edit Role — ${editing.name}` : "Create Role"}
        className="max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name}>
              {save.isPending ? "Saving…" : editing ? "Save Changes" : "Create"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Name *">
            <Input
              value={form.name}
              autoFocus
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label={`Permissions (${form.permission_codes.length} selected)`}>
            <div className="flex max-h-80 flex-col gap-3 overflow-y-auto rounded-md border border-gray-200 p-3">
              {permsByCategory.map(([category, perms]) => (
                <div key={category} className="flex flex-col gap-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {category}
                  </p>
                  {perms.map((perm) => (
                    <label key={perm.code} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.permission_codes.includes(perm.code)}
                        onChange={() => togglePermission(perm.code)}
                      />
                      <code className="text-xs text-gray-600">{perm.code}</code>
                      <span className="text-gray-500">— {perm.name}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete Role"
        description={`Delete role "${deleting?.name}"? Any bindings using it will be removed.`}
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

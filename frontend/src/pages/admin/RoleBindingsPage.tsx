import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Link2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { PermissionGate } from "@/components/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useRoleBindings, useRoles, useUserGroups } from "@/hooks/queries";
import { api, ApiError } from "@/services/api";
import { toast } from "@/stores/toast";
import type { RoleBinding } from "@/types";

interface BindingForm {
  user_group_id: string;
  role_id: string;
  scope_type: string;
}

const EMPTY_FORM: BindingForm = { user_group_id: "", role_id: "", scope_type: "GLOBAL" };

export function RoleBindingsPage() {
  const { data: bindings, isLoading } = useRoleBindings();
  const { data: groups } = useUserGroups();
  const { data: roles } = useRoles();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<RoleBinding | null>(null);
  const [form, setForm] = useState<BindingForm>(EMPTY_FORM);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["role-bindings"] });
    void queryClient.invalidateQueries({ queryKey: ["user-groups"] });
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: () =>
      api.createRoleBinding({
        user_group_id: form.user_group_id,
        role_id: form.role_id,
        scope_type: form.scope_type,
      }),
    onSuccess: () => {
      toast.success("Role binding created");
      setDialogOpen(false);
      invalidate();
    },
    onError: (err) =>
      toast.error("Save failed", err instanceof ApiError ? err.message : "Unexpected error"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteRoleBinding(id),
    onSuccess: () => {
      toast.success("Binding removed");
      setDeleting(null);
      invalidate();
    },
    onError: (err) =>
      toast.error("Delete failed", err instanceof ApiError ? err.message : "Unexpected error"),
  });

  const columns = useMemo<ColumnDef<RoleBinding, unknown>[]>(
    () => [
      { accessorKey: "user_group_name", header: "User Group" },
      {
        accessorKey: "role_name",
        header: "Role",
        cell: ({ row }) => <Badge variant="default">{row.original.role_name}</Badge>,
      },
      {
        accessorKey: "scope_type",
        header: "Scope",
        cell: ({ row }) => <Badge variant="muted">{row.original.scope_type}</Badge>,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <PermissionGate permission="binding.delete">
              <Button variant="ghost" size="icon" onClick={() => setDeleting(row.original)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </PermissionGate>
          </div>
        ),
      },
    ],
    [],
  );

  const canSubmit = Boolean(form.user_group_id && form.role_id);

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb crumbs={[{ label: "Access Management" }, { label: "Role Bindings" }]} />
      <p className="text-sm text-gray-500">
        A role binding grants a role to a user group. Members of the group inherit the role's
        permissions. Scope is GLOBAL today; CLUSTER and RACK scoping are reserved for a future
        release.
      </p>

      <DataTable
        data={bindings ?? []}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search bindings…"
        toolbar={
          <PermissionGate permission="binding.create">
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Create Binding
            </Button>
          </PermissionGate>
        }
        emptyState={
          <EmptyState
            Icon={Link2}
            title="No role bindings"
            description="Bind a role to a user group to grant its permissions."
          />
        }
      />

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Create Role Binding"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !canSubmit}>
              {save.isPending ? "Saving…" : "Create"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="User Group *">
            <Select
              value={form.user_group_id}
              onChange={(e) => setForm({ ...form, user_group_id: e.target.value })}
            >
              <option value="">Select a group…</option>
              {(groups ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Role *">
            <Select
              value={form.role_id}
              onChange={(e) => setForm({ ...form, role_id: e.target.value })}
            >
              <option value="">Select a role…</option>
              {(roles ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Scope">
            <Select value={form.scope_type} disabled onChange={() => undefined}>
              <option value="GLOBAL">GLOBAL</option>
            </Select>
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Remove Role Binding"
        confirmLabel="Remove"
        description={`Remove the "${deleting?.role_name}" role from group "${deleting?.user_group_name}"?`}
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

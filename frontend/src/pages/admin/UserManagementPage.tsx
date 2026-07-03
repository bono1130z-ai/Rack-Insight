import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2, UserCog } from "lucide-react";
import { useMemo, useState } from "react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useUsers } from "@/hooks/queries";
import { api, ApiError } from "@/services/api";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/toast";
import type { User, UserRole } from "@/types";

const MIN_PASSWORD_LENGTH = 8;

interface UserForm {
  username: string;
  password: string;
  role: UserRole;
  enabled: boolean;
}

const EMPTY_FORM: UserForm = { username: "", password: "", role: "USER", enabled: true };

export function UserManagementPage() {
  const { data: users, isLoading } = useUsers();
  const { user: currentUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["users"] });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setForm({ username: user.username, password: "", role: user.role, enabled: user.enabled });
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: () => {
      if (editing) {
        const payload: Record<string, unknown> = {
          role: form.role,
          enabled: form.enabled,
        };
        // Password is optional on edit; empty keeps the current one.
        if (form.password) payload.password = form.password;
        return api.updateUser(editing.id, payload);
      }
      return api.createUser({
        username: form.username,
        password: form.password,
        role: form.role,
      });
    },
    onSuccess: () => {
      toast.success(editing ? "User updated" : "User created", form.username);
      setDialogOpen(false);
      invalidate();
    },
    onError: (err) =>
      toast.error("Save failed", err instanceof ApiError ? err.message : "Unexpected error"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => {
      toast.success("User deleted", deleting?.username);
      setDeleting(null);
      invalidate();
    },
    onError: (err) =>
      toast.error("Delete failed", err instanceof ApiError ? err.message : "Unexpected error"),
  });

  const passwordInvalid =
    (!editing && form.password.length < MIN_PASSWORD_LENGTH) ||
    (Boolean(form.password) && form.password.length < MIN_PASSWORD_LENGTH);

  const columns = useMemo<ColumnDef<User, unknown>[]>(
    () => [
      { accessorKey: "username", header: "Username" },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => (
          <Badge variant={row.original.role === "ADMIN" ? "default" : "muted"}>
            {row.original.role}
          </Badge>
        ),
      },
      {
        accessorKey: "enabled",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.enabled ? "success" : "critical"}>
            {row.original.enabled ? "Enabled" : "Disabled"}
          </Badge>
        ),
      },
      {
        accessorKey: "last_login",
        header: "Last Login",
        cell: (c) =>
          c.getValue() ? new Date(String(c.getValue())).toLocaleString() : "-",
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
              <Pencil className="h-4 w-4 text-gray-500" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={row.original.id === currentUser?.id}
              onClick={() => setDeleting(row.original)}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser?.id],
  );

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb crumbs={[{ label: "Administration" }, { label: "User Management" }]} />

      <DataTable
        data={users ?? []}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search users…"
        toolbar={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Create User
          </Button>
        }
        emptyState={
          <EmptyState
            Icon={UserCog}
            title="No users"
            description="Create operator accounts with ADMIN or USER roles."
            action={
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> Create User
              </Button>
            }
          />
        }
      />

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? `Edit User — ${editing.username}` : "Create User"}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={
                save.isPending || (!editing && !form.username) || passwordInvalid
              }
            >
              {save.isPending ? "Saving…" : editing ? "Save Changes" : "Create"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Username *">
            <Input
              value={form.username}
              disabled={Boolean(editing)}
              autoFocus={!editing}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </Field>
          <Field
            label={
              editing
                ? "New Password (leave blank to keep current)"
                : `Password * (min ${MIN_PASSWORD_LENGTH} chars)`
            }
          >
            <Input
              type="password"
              value={form.password}
              autoComplete="new-password"
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <Select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            >
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </Select>
          </Field>
          {editing && (
            <Field label="Status">
              <Select
                value={form.enabled ? "enabled" : "disabled"}
                onChange={(e) => setForm({ ...form, enabled: e.target.value === "enabled" })}
              >
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </Select>
            </Field>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete User"
        description={`Delete user "${deleting?.username}"? This cannot be undone.`}
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

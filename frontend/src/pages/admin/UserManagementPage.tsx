import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UserCog } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Breadcrumb } from "@/components/Breadcrumb";
import { useUsers } from "@/hooks/queries";
import { api, ApiError } from "@/services/api";

export function UserManagementPage() {
  const { data: users } = useUsers();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ username: "", password: "", role: "USER" });
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["users"] });

  const createUser = useMutation({
    mutationFn: () => api.createUser(form),
    onSuccess: () => {
      setForm({ username: "", password: "", role: "USER" });
      setError(null);
      invalidate();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Failed to create user"),
  });

  const toggleEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.updateUser(id, { enabled }),
    onSuccess: invalidate,
  });

  const removeUser = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: invalidate,
  });

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb crumbs={[{ label: "Clusters", to: "/" }, { label: "User Management" }]} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-blue-600" /> Users
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Username</TH>
                <TH>Role</TH>
                <TH>Enabled</TH>
                <TH>Last Login</TH>
                <TH className="w-32" />
              </TR>
            </THead>
            <TBody>
              {users?.map((user) => (
                <TR key={user.id}>
                  <TD className="font-medium">{user.username}</TD>
                  <TD>
                    <Badge variant={user.role === "ADMIN" ? "default" : "muted"}>
                      {user.role}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge variant={user.enabled ? "success" : "critical"}>
                      {user.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-gray-500">
                    {user.last_login ? new Date(user.last_login).toLocaleString() : "-"}
                  </TD>
                  <TD>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          toggleEnabled.mutate({ id: user.id, enabled: !user.enabled })
                        }
                      >
                        {user.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeUser.mutate(user.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create User</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Input
            className="w-56"
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <Input
            className="w-56"
            placeholder="Password (min 8 chars)"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <select
            className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <Button
            disabled={!form.username || form.password.length < 8 || createUser.isPending}
            onClick={() => createUser.mutate()}
          >
            <Plus className="h-4 w-4" /> Create
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

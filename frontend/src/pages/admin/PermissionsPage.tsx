import { useMemo } from "react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/queries";
import type { Permission } from "@/types";

export function PermissionsPage() {
  const { data: permissions, isLoading } = usePermissions();

  const byCategory = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const perm of permissions ?? []) {
      const list = map.get(perm.category) ?? [];
      list.push(perm);
      map.set(perm.category, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb crumbs={[{ label: "Access Management" }, { label: "Permissions" }]} />
      <p className="text-sm text-gray-500">
        The full catalog of business-action permissions. Permissions are assigned to roles;
        roles are bound to user groups; users inherit them through group membership. This
        catalog is read-only.
      </p>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {byCategory.map(([category, perms]) => (
            <Card key={category}>
              <CardContent className="p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  {category}
                  <Badge variant="muted">{perms.length}</Badge>
                </h3>
                <div className="flex flex-col gap-2">
                  {perms.map((perm) => (
                    <div key={perm.id} className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
                          {perm.code}
                        </code>
                        <span className="text-sm text-gray-800">{perm.name}</span>
                      </div>
                      {perm.description && (
                        <span className="text-xs text-gray-500">{perm.description}</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

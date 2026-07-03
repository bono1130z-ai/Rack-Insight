import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Boxes, Network, Plus, Server as ServerIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumb } from "@/components/Breadcrumb";
import { EmptyState } from "@/components/EmptyState";
import { useClusters } from "@/hooks/queries";
import { api, ApiError } from "@/services/api";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/toast";

export function DashboardPage() {
  const { data: clusters, isLoading } = useClusters();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", site: "", vendor: "" });

  const createCluster = useMutation({
    mutationFn: () =>
      api.createCluster({
        name: form.name,
        site: form.site || null,
        vendor: form.vendor || null,
      }),
    onSuccess: (cluster) => {
      toast.success("Cluster created", form.name);
      setCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["clusters"] });
      // Take the admin straight to the (empty) rack list of the new cluster.
      navigate(`/clusters/${cluster.id}`);
    },
    onError: (err) =>
      toast.error(
        "Create failed",
        err instanceof ApiError ? err.message : "Unexpected error",
      ),
  });

  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb crumbs={[{ label: "Clusters" }]} />
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : clusters?.length === 0 ? (
        <EmptyState
          Icon={Boxes}
          title="No clusters yet"
          description={
            isAdmin
              ? "Create your first cluster, then add racks and register devices — all from the web UI."
              : "No clusters have been configured yet. Ask an administrator to create one."
          }
          action={
            isAdmin ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create Cluster
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clusters?.map((cluster) => (
            <motion.div key={cluster.id} whileHover={{ scale: 1.01 }}>
              <Card
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/clusters/${cluster.id}`)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Boxes className="h-5 w-5 text-blue-600" />
                      {cluster.name}
                    </CardTitle>
                    {cluster.vendor && <Badge variant="muted">{cluster.vendor}</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-2 text-sm">
                  <div className="flex items-center gap-1 text-gray-600">
                    <Boxes className="h-4 w-4" /> {cluster.rack_count} Racks
                  </div>
                  <div className="flex items-center gap-1 text-gray-600">
                    <ServerIcon className="h-4 w-4" /> {cluster.server_count} Servers
                  </div>
                  <div className="flex items-center gap-1 text-gray-600">
                    <Network className="h-4 w-4" /> {cluster.switch_count} Switches
                  </div>
                  <div className="col-span-3 mt-2 flex items-center gap-2">
                    <Badge variant="success">{cluster.online_count} Online</Badge>
                    {cluster.warning_count > 0 && (
                      <Badge variant="warning">{cluster.warning_count} Warning</Badge>
                    )}
                    <span className="ml-auto text-xs text-gray-400">
                      {cluster.last_refresh
                        ? `Refreshed ${new Date(cluster.last_refresh).toLocaleString()}`
                        : "Never refreshed"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Cluster"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createCluster.mutate()}
              disabled={!form.name || createCluster.isPending}
            >
              {createCluster.isPending ? "Creating…" : "Create"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Cluster Name *">
            <Input
              value={form.name}
              autoFocus
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Site">
            <Input
              value={form.site}
              placeholder="e.g. Seoul DC1 Room 3"
              onChange={(e) => setForm({ ...form, site: e.target.value })}
            />
          </Field>
          <Field label="Vendor">
            <Input
              value={form.vendor}
              placeholder="e.g. HPE"
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

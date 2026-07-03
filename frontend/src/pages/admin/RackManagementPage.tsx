import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Boxes, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useClusterRacks, useClusters } from "@/hooks/queries";
import { api, ApiError } from "@/services/api";
import { toast } from "@/stores/toast";
import type { RackSummary } from "@/types";

const DEFAULT_RACK_HEIGHT = 42;

interface RackForm {
  name: string;
  cluster_id: string;
  height: number;
  location: string;
  description: string;
}

export function RackManagementPage() {
  const { data: clusters } = useClusters();
  const [clusterId, setClusterId] = useState<string>("");
  const { data: racks, isLoading } = useClusterRacks(clusterId);
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RackSummary | null>(null);
  const [deleting, setDeleting] = useState<RackSummary | null>(null);
  const [form, setForm] = useState<RackForm>({
    name: "",
    cluster_id: "",
    height: DEFAULT_RACK_HEIGHT,
    location: "",
    description: "",
  });

  useEffect(() => {
    if (!clusterId && clusters && clusters.length > 0) {
      setClusterId(clusters[0].id);
    }
  }, [clusters, clusterId]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["cluster", clusterId, "racks"] });
    void queryClient.invalidateQueries({ queryKey: ["clusters"] });
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      cluster_id: clusterId,
      height: DEFAULT_RACK_HEIGHT,
      location: "",
      description: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (rack: RackSummary) => {
    setEditing(rack);
    setForm({
      name: rack.name,
      cluster_id: rack.cluster_id,
      height: rack.height,
      location: rack.location ?? "",
      description: rack.description ?? "",
    });
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        cluster_id: form.cluster_id,
        name: form.name,
        height: form.height,
        location: form.location || null,
        description: form.description || null,
      };
      return editing ? api.updateRack(editing.id, payload) : api.createRack(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Rack updated" : "Rack created", form.name);
      setDialogOpen(false);
      invalidate();
    },
    onError: (err) =>
      toast.error("Save failed", err instanceof ApiError ? err.message : "Unexpected error"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteRack(id),
    onSuccess: () => {
      toast.success("Rack deleted", deleting?.name);
      setDeleting(null);
      invalidate();
    },
    onError: (err) =>
      toast.error("Delete failed", err instanceof ApiError ? err.message : "Unexpected error"),
  });

  const clusterName = (id: string) => clusters?.find((c) => c.id === id)?.name ?? "-";

  const columns = useMemo<ColumnDef<RackSummary, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Rack Name" },
      {
        accessorKey: "cluster_id",
        header: "Cluster",
        cell: (c) => clusterName(String(c.getValue())),
      },
      { accessorKey: "height", header: "Height", cell: (c) => `${c.getValue()}U` },
      { accessorKey: "location", header: "Location", cell: (c) => c.getValue() ?? "-" },
      {
        accessorKey: "description",
        header: "Description",
        cell: (c) => c.getValue() ?? "-",
      },
      { accessorKey: "device_count", header: "Devices" },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
              <Pencil className="h-4 w-4 text-gray-500" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setDeleting(row.original)}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clusters],
  );

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb crumbs={[{ label: "Administration" }, { label: "Rack Management" }]} />

      <div className="flex items-center gap-3">
        <Field label="Cluster">
          <Select
            className="w-64"
            value={clusterId}
            onChange={(e) => setClusterId(e.target.value)}
          >
            {clusters?.map((cluster) => (
              <option key={cluster.id} value={cluster.id}>
                {cluster.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <DataTable
        data={racks ?? []}
        columns={columns}
        isLoading={isLoading && Boolean(clusterId)}
        searchPlaceholder="Search racks…"
        toolbar={
          <Button onClick={openCreate} disabled={!clusterId}>
            <Plus className="h-4 w-4" /> Create Rack
          </Button>
        }
        emptyState={
          <EmptyState
            Icon={Boxes}
            title="No racks in this cluster"
            description="Create a rack to start placing devices."
            action={
              <Button onClick={openCreate} disabled={!clusterId}>
                <Plus className="h-4 w-4" /> Create Rack
              </Button>
            }
          />
        }
      />

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? `Edit Rack — ${editing.name}` : "Create Rack"}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!form.name || !form.cluster_id || save.isPending}
            >
              {save.isPending ? "Saving…" : editing ? "Save Changes" : "Create"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Rack Name *">
            <Input
              value={form.name}
              autoFocus
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Cluster *">
            <Select
              value={form.cluster_id}
              onChange={(e) => setForm({ ...form, cluster_id: e.target.value })}
            >
              {clusters?.map((cluster) => (
                <option key={cluster.id} value={cluster.id}>
                  {cluster.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Height (U)">
            <Input
              type="number"
              min={1}
              max={60}
              value={form.height}
              onChange={(e) => setForm({ ...form, height: Number(e.target.value) })}
            />
          </Field>
          <Field label="Location">
            <Input
              value={form.location}
              placeholder="e.g. Row A, Position 3"
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete Rack"
        description={`Delete rack "${deleting?.name}"? All devices in this rack will be removed. This cannot be undone.`}
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

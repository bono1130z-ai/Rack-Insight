import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api, ApiError } from "@/services/api";
import { toast } from "@/stores/toast";
import type { RetentionPolicy } from "@/types";

const LABELS: Record<string, string> = {
  collector_runs: "Collector Run History",
  snapshots: "Inventory Snapshot History",
  discovery: "Discovery Cache",
};

const DESCRIPTIONS: Record<string, string> = {
  collector_runs: "Per-device collection attempt logs.",
  snapshots: "Historical inventory snapshots. The latest per device is always kept.",
  discovery: "Discovered devices awaiting import (imported ones are never removed).",
};

export function LifecyclePage() {
  const queryClient = useQueryClient();
  const { data: policies, isLoading } = useQuery({
    queryKey: ["lifecycle", "policies"],
    queryFn: api.retentionPolicies,
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["lifecycle", "policies"] });

  const update = useMutation({
    mutationFn: ({ category, patch }: { category: string; patch: Record<string, unknown> }) =>
      api.updateRetentionPolicy(category, patch),
    onSuccess: () => {
      toast.success("Retention updated");
      invalidate();
    },
    onError: (err) =>
      toast.error("Update failed", err instanceof ApiError ? err.message : "Unexpected error"),
  });

  const cleanup = useMutation({
    mutationFn: () => api.runCleanup(),
    onSuccess: (result) =>
      toast.success(
        "Cleanup complete",
        result.total > 0 ? `Removed ${result.total} old records` : "Nothing to remove",
      ),
    onError: (err) =>
      toast.error("Cleanup failed", err instanceof ApiError ? err.message : "Unexpected error"),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Breadcrumb crumbs={[{ label: "Administration" }, { label: "Lifecycle & Retention" }]} />
        <Button onClick={() => cleanup.mutate()} disabled={cleanup.isPending}>
          <Trash2 className="h-4 w-4" />
          {cleanup.isPending ? "Cleaning…" : "Run Cleanup Now"}
        </Button>
      </div>
      <p className="text-sm text-gray-500">
        Operational history can be automatically pruned. Current inventory is
        always preserved. Enabled policies are applied automatically and on
        demand.
      </p>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Category</TH>
              <TH>Description</TH>
              <TH className="w-32">Retention (days)</TH>
              <TH className="w-28">Status</TH>
              <TH className="w-40" />
            </TR>
          </THead>
          <TBody>
            {policies?.map((policy: RetentionPolicy) => (
              <TR key={policy.id}>
                <TD className="font-medium">{LABELS[policy.category] ?? policy.category}</TD>
                <TD className="text-xs text-gray-500">
                  {DESCRIPTIONS[policy.category] ?? ""}
                </TD>
                <TD>
                  <Input
                    type="number"
                    min={1}
                    max={3650}
                    className="h-8 w-24"
                    defaultValue={policy.retention_days}
                    onBlur={(e) => {
                      const days = Number(e.target.value);
                      if (days && days !== policy.retention_days) {
                        update.mutate({
                          category: policy.category,
                          patch: { retention_days: days },
                        });
                      }
                    }}
                  />
                </TD>
                <TD>
                  <Badge variant={policy.enabled ? "success" : "muted"}>
                    {policy.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </TD>
                <TD>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      update.mutate({
                        category: policy.category,
                        patch: { enabled: !policy.enabled },
                      })
                    }
                  >
                    {policy.enabled ? "Disable" : "Enable"}
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

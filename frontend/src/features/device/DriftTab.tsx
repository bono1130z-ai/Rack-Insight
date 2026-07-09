import { useQuery } from "@tanstack/react-query";
import { GitCompareArrows } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api } from "@/services/api";
import type { DriftChange } from "@/types";

const CHANGE_VARIANT: Record<DriftChange["change"], "success" | "critical" | "warning"> = {
  added: "success",
  removed: "critical",
  changed: "warning",
};

export function DriftTab({ deviceId }: { deviceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["device", deviceId, "drift"],
    queryFn: () => api.deviceDrift(deviceId),
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data) return null;

  if (!data.has_previous) {
    return (
      <EmptyState
        Icon={GitCompareArrows}
        title="No previous collection to compare"
        description="Drift appears after at least two successful collections. Run a collection to build history."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500">
        Comparing{" "}
        {data.previous_collected_at
          ? new Date(data.previous_collected_at).toLocaleString()
          : "—"}{" "}
        →{" "}
        {data.current_collected_at
          ? new Date(data.current_collected_at).toLocaleString()
          : "—"}
      </p>
      {data.changes.length === 0 ? (
        <EmptyState
          Icon={GitCompareArrows}
          title="No hardware changes detected"
          description="The two most recent successful collections are identical."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Section</TH>
              <TH>Component</TH>
              <TH>Field</TH>
              <TH>Change</TH>
              <TH>Previous</TH>
              <TH>Current</TH>
            </TR>
          </THead>
          <TBody>
            {data.changes.map((c, i) => (
              <TR key={i}>
                <TD>{c.section}</TD>
                <TD className="font-mono text-xs">{c.identifier}</TD>
                <TD>{c.field ?? "-"}</TD>
                <TD>
                  <Badge variant={CHANGE_VARIANT[c.change]}>{c.change}</Badge>
                </TD>
                <TD className="text-xs text-gray-500">{c.old_value ?? "-"}</TD>
                <TD className="text-xs font-medium">{c.new_value ?? "-"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

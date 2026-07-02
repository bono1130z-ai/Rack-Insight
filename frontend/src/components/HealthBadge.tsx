import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function HealthBadge({
  score,
  label,
}: {
  score: number | null;
  label: string | null;
}) {
  if (score === null || label === null) {
    return <Badge variant="muted">No health data</Badge>;
  }
  const variant =
    label === "Healthy" ? "success" : label === "Warning" ? "warning" : "critical";
  return (
    <Badge variant={variant}>
      <Activity className="h-3 w-3" />
      {score} · {label}
    </Badge>
  );
}

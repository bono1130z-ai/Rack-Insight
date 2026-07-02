import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DeviceStatus } from "@/types";

const config: Record<
  DeviceStatus | "REFRESHING",
  { label: string; variant: "success" | "warning" | "critical" | "muted" | "default"; Icon: typeof CheckCircle2 }
> = {
  ONLINE: { label: "Online", variant: "success", Icon: CheckCircle2 },
  WARNING: { label: "Warning", variant: "warning", Icon: AlertTriangle },
  OFFLINE: { label: "Offline", variant: "critical", Icon: XCircle },
  UNKNOWN: { label: "Unknown", variant: "muted", Icon: HelpCircle },
  REFRESHING: { label: "Refreshing", variant: "default", Icon: RefreshCw },
};

export function StatusBadge({ status }: { status: DeviceStatus | "REFRESHING" }) {
  const { label, variant, Icon } = config[status] ?? config.UNKNOWN;
  return (
    <Badge variant={variant}>
      <Icon className={status === "REFRESHING" ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
      {label}
    </Badge>
  );
}

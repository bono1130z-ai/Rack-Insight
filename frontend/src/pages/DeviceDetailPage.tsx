import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Cpu,
  HardDrive,
  Layers,
  MonitorPlay,
  Network as NetworkIcon,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ExportMenu } from "@/components/ExportMenu";
import { HealthBadge } from "@/components/HealthBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { FirmwareTab } from "@/features/device/FirmwareTab";
import { HardwareTab } from "@/features/device/HardwareTab";
import { NetworkTab } from "@/features/device/NetworkTab";
import { OverviewTab } from "@/features/device/OverviewTab";
import { SensorTab } from "@/features/device/SensorTab";
import { StorageTab } from "@/features/device/StorageTab";
import { VMTab } from "@/features/device/VMTab";
import {
  useCluster,
  useDevice,
  useDeviceInventory,
  useRackLayout,
  useRefreshDevice,
} from "@/hooks/queries";
import { useAuthStore } from "@/stores/auth";

const TABS = [
  { id: "overview", label: "Overview", Icon: Layers },
  { id: "hardware", label: "Hardware", Icon: Cpu },
  { id: "firmware", label: "Firmware", Icon: Wrench },
  { id: "network", label: "Network", Icon: NetworkIcon },
  { id: "storage", label: "Storage", Icon: HardDrive },
  { id: "vm", label: "Virtual Machine", Icon: MonitorPlay },
  { id: "sensor", label: "Sensor", Icon: Activity },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DeviceDetailPage() {
  const { deviceId = "" } = useParams();
  const [tab, setTab] = useState<TabId>("overview");
  const { data: device, isLoading: deviceLoading } = useDevice(deviceId);
  const { data: inventory, isLoading: inventoryLoading, isError } = useDeviceInventory(deviceId);
  const { data: rackLayout } = useRackLayout(device?.rack_id ?? "");
  const { data: cluster } = useCluster(rackLayout?.rack.cluster_id ?? "");
  const refresh = useRefreshDevice(deviceId);
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";

  if (deviceLoading || !device) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-96" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        crumbs={[
          { label: "Clusters", to: "/" },
          {
            label: cluster?.name ?? "Cluster",
            to: rackLayout ? `/clusters/${rackLayout.rack.cluster_id}` : undefined,
          },
          {
            label: rackLayout?.rack.name ?? "Rack",
            to: `/racks/${device.rack_id}`,
          },
          { label: device.display_name ?? device.hostname },
        ]}
      />

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{device.display_name ?? device.hostname}</h1>
            <StatusBadge status={refresh.isPending ? "REFRESHING" : device.status} />
            <HealthBadge score={device.health_score} label={device.health_label} />
          </div>
          <p className="text-sm text-gray-500">
            {device.vendor ?? "Unknown vendor"} · {device.model ?? "Unknown model"}
            {device.serial ? ` · SN ${device.serial}` : ""}
          </p>
          <p className="text-xs text-gray-400">
            Management IP: {device.management_ip ?? "-"} · iLO IP: {device.ilo_ip ?? "-"} ·
            Last refresh:{" "}
            {device.last_refresh ? new Date(device.last_refresh).toLocaleString() : "Never"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ExportMenu scope="device" targetId={deviceId} />
          {isAdmin && (
            <Button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              <RefreshCw
                className={refresh.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              />
              {refresh.isPending ? "Refreshing…" : "Refresh"}
            </Button>
          )}
        </div>
      </div>

      {(isError || refresh.isError) && (
        <div className="flex items-center gap-2 rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
          <AlertTriangle className="h-4 w-4" />
          Collector failed — showing last successful data
          {inventory?.snapshot &&
            ` (last success: ${new Date(inventory.snapshot.collected_at).toLocaleString()})`}
          .
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => refresh.mutate()}
            >
              Retry
            </Button>
          )}
        </div>
      )}

      <div className="flex gap-4">
        <nav className="flex w-48 shrink-0 flex-col gap-1">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                tab === id
                  ? "bg-blue-600 font-medium text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {inventoryLoading || !inventory ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                {tab === "overview" && (
                  <OverviewTab inventory={inventory} device={device} />
                )}
                {tab === "hardware" && <HardwareTab inventory={inventory} />}
                {tab === "firmware" && <FirmwareTab firmwares={inventory.firmwares} />}
                {tab === "network" && <NetworkTab networks={inventory.networks} />}
                {tab === "storage" && <StorageTab storages={inventory.storages} />}
                {tab === "vm" && <VMTab vms={inventory.vms} />}
                {tab === "sensor" && <SensorTab sensors={inventory.sensors} />}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}

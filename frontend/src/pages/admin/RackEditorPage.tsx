import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Breadcrumb } from "@/components/Breadcrumb";
import { useRackLayout } from "@/hooks/queries";
import { api, ApiError } from "@/services/api";

interface EditableUnit {
  u_position: number;
  height: number;
  device_id: string | null;
}

export function RackEditorPage() {
  const { rackId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: layout } = useRackLayout(rackId);
  const { data: devices } = useQuery({
    queryKey: ["devices", rackId],
    queryFn: () => api.devices(rackId),
  });

  const [units, setUnits] = useState<EditableUnit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newDevice, setNewDevice] = useState({
    hostname: "",
    device_type: "SERVER",
    management_ip: "",
    ilo_ip: "",
    ilo_username: "",
    ilo_password: "",
    ssh_username: "",
    ssh_password: "",
  });

  useEffect(() => {
    if (layout) {
      setUnits(
        layout.units.map((unit) => ({
          u_position: unit.u_position,
          height: unit.height,
          device_id: unit.device?.id ?? null,
        })),
      );
    }
  }, [layout]);

  const save = useMutation({
    mutationFn: () => api.updateRackLayout(rackId, units),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["rack", rackId, "layout"] });
      navigate(`/racks/${rackId}`);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Failed to save layout"),
  });

  const createDevice = useMutation({
    mutationFn: () =>
      api.createDevice({
        rack_id: rackId,
        hostname: newDevice.hostname,
        device_type: newDevice.device_type,
        management_ip: newDevice.management_ip || null,
        ilo_ip: newDevice.ilo_ip || null,
        ilo_username: newDevice.ilo_username || null,
        ilo_password: newDevice.ilo_password || null,
        ssh_username: newDevice.ssh_username || null,
        ssh_password: newDevice.ssh_password || null,
      }),
    onSuccess: () => {
      setNewDevice({
        hostname: "",
        device_type: "SERVER",
        management_ip: "",
        ilo_ip: "",
        ilo_username: "",
        ilo_password: "",
        ssh_username: "",
        ssh_password: "",
      });
      void queryClient.invalidateQueries({ queryKey: ["devices", rackId] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Failed to register device"),
  });

  const updateUnit = (index: number, patch: Partial<EditableUnit>) => {
    setUnits((prev) => prev.map((unit, i) => (i === index ? { ...unit, ...patch } : unit)));
  };

  if (!layout) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Breadcrumb
          crumbs={[
            { label: "Clusters", to: "/" },
            { label: "Rack", to: `/racks/${rackId}` },
            { label: `${layout.rack.name} — Edit` },
          ]}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/racks/${rackId}`)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4" /> Save Layout
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Layout ({layout.rack.height}U)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH className="w-28">U Position</TH>
                <TH>Device</TH>
                <TH className="w-28">Height (U)</TH>
                <TH className="w-16" />
              </TR>
            </THead>
            <TBody>
              {units
                .slice()
                .sort((a, b) => b.u_position - a.u_position)
                .map((unit) => {
                  const index = units.indexOf(unit);
                  return (
                    <TR key={index}>
                      <TD>
                        <Input
                          type="number"
                          min={1}
                          max={layout.rack.height}
                          value={unit.u_position}
                          onChange={(e) =>
                            updateUnit(index, { u_position: Number(e.target.value) })
                          }
                        />
                      </TD>
                      <TD>
                        <select
                          className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm"
                          value={unit.device_id ?? ""}
                          onChange={(e) =>
                            updateUnit(index, { device_id: e.target.value || null })
                          }
                        >
                          <option value="">(Blank)</option>
                          {devices?.map((device) => (
                            <option key={device.id} value={device.id}>
                              {device.hostname} ({device.device_type})
                            </option>
                          ))}
                        </select>
                      </TD>
                      <TD>
                        <select
                          className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm"
                          value={unit.height}
                          onChange={(e) =>
                            updateUnit(index, { height: Number(e.target.value) })
                          }
                        >
                          {[1, 2, 4].map((h) => (
                            <option key={h} value={h}>
                              {h}U
                            </option>
                          ))}
                        </select>
                      </TD>
                      <TD>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setUnits((prev) => prev.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
            </TBody>
          </Table>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() =>
              setUnits((prev) => [
                ...prev,
                { u_position: 1, height: 1, device_id: null },
              ])
            }
          >
            <Plus className="h-4 w-4" /> Add Row
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Register New Device</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Input
            placeholder="Hostname *"
            value={newDevice.hostname}
            onChange={(e) => setNewDevice({ ...newDevice, hostname: e.target.value })}
          />
          <select
            className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
            value={newDevice.device_type}
            onChange={(e) => setNewDevice({ ...newDevice, device_type: e.target.value })}
          >
            {["SERVER", "SWITCH", "PDU", "KVM", "OTHER"].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <Input
            placeholder="Management IP"
            value={newDevice.management_ip}
            onChange={(e) => setNewDevice({ ...newDevice, management_ip: e.target.value })}
          />
          <Input
            placeholder="iLO IP"
            value={newDevice.ilo_ip}
            onChange={(e) => setNewDevice({ ...newDevice, ilo_ip: e.target.value })}
          />
          <Input
            placeholder="iLO Username"
            value={newDevice.ilo_username}
            onChange={(e) => setNewDevice({ ...newDevice, ilo_username: e.target.value })}
          />
          <Input
            placeholder="iLO Password"
            type="password"
            value={newDevice.ilo_password}
            onChange={(e) => setNewDevice({ ...newDevice, ilo_password: e.target.value })}
          />
          <Input
            placeholder="SSH Username"
            value={newDevice.ssh_username}
            onChange={(e) => setNewDevice({ ...newDevice, ssh_username: e.target.value })}
          />
          <Input
            placeholder="SSH Password"
            type="password"
            value={newDevice.ssh_password}
            onChange={(e) => setNewDevice({ ...newDevice, ssh_password: e.target.value })}
          />
          <Button
            className="col-span-2 lg:col-span-4 lg:w-48"
            disabled={!newDevice.hostname || createDevice.isPending}
            onClick={() => createDevice.mutate()}
          >
            <Plus className="h-4 w-4" /> Register Device
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Sensor } from "@/types";

const OK_VALUES = new Set(["ok", "healthy", "good", "normal", "enabled", ""]);

export function SensorTab({ sensors }: { sensors: Sensor[] }) {
  if (sensors.length === 0) {
    return <p className="text-sm text-gray-500">No sensor data collected yet.</p>;
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Type</TH>
          <TH>Name</TH>
          <TH>Value</TH>
          <TH>Status</TH>
        </TR>
      </THead>
      <TBody>
        {sensors.map((sensor) => {
          const ok = OK_VALUES.has((sensor.status ?? "").toLowerCase());
          return (
            <TR key={sensor.id}>
              <TD>{sensor.type ?? "-"}</TD>
              <TD>{sensor.name ?? "-"}</TD>
              <TD>
                {sensor.value ?? "-"} {sensor.unit ?? ""}
              </TD>
              <TD>
                <Badge variant={ok ? "success" : "warning"}>
                  {sensor.status ?? "Unknown"}
                </Badge>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

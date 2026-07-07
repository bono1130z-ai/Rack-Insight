import { StatusPill, normalizeStatus } from "@/components/StatusPill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Sensor } from "@/types";

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
        {sensors.map((sensor) => (
          <TR key={sensor.id}>
            <TD>{sensor.type ?? "-"}</TD>
            <TD>{sensor.name ?? "-"}</TD>
            <TD>
              {sensor.value ?? "-"} {sensor.unit ?? ""}
            </TD>
            <TD>
              <StatusPill
                status={normalizeStatus(sensor.status)}
                text={sensor.status ?? "Unknown"}
              />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

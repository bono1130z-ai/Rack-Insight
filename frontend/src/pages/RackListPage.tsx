import { motion } from "framer-motion";
import { Boxes } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumb } from "@/components/Breadcrumb";
import { useCluster, useClusterRacks } from "@/hooks/queries";

export function RackListPage() {
  const { clusterId = "" } = useParams();
  const { data: cluster } = useCluster(clusterId);
  const { data: racks, isLoading } = useClusterRacks(clusterId);
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        crumbs={[
          { label: "Clusters", to: "/" },
          { label: cluster?.name ?? "…" },
        ]}
      />
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {racks?.map((rack) => (
            <motion.div key={rack.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Card
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/racks/${rack.id}`)}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Boxes className="h-5 w-5 text-blue-600" />
                    {rack.name}
                  </CardTitle>
                  <p className="text-xs text-gray-500">
                    {rack.location ?? "No location"} · {rack.height}U
                  </p>
                </CardHeader>
                <CardContent className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">{rack.device_count} devices</span>
                  <span className="ml-auto flex gap-1">
                    <Badge variant="success">{rack.online_count}</Badge>
                    {rack.warning_count > 0 && (
                      <Badge variant="warning">{rack.warning_count}</Badge>
                    )}
                    {rack.offline_count > 0 && (
                      <Badge variant="critical">{rack.offline_count}</Badge>
                    )}
                  </span>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          {racks?.length === 0 && (
            <p className="text-sm text-gray-500">No racks in this cluster yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

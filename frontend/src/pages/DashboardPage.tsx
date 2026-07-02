import { motion } from "framer-motion";
import { Boxes, Network, Server as ServerIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumb } from "@/components/Breadcrumb";
import { useClusters } from "@/hooks/queries";

export function DashboardPage() {
  const { data: clusters, isLoading } = useClusters();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb crumbs={[{ label: "Clusters" }]} />
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clusters?.map((cluster) => (
            <motion.div key={cluster.id} whileHover={{ scale: 1.01 }}>
              <Card
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/clusters/${cluster.id}`)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Boxes className="h-5 w-5 text-blue-600" />
                      {cluster.name}
                    </CardTitle>
                    {cluster.vendor && <Badge variant="muted">{cluster.vendor}</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-2 text-sm">
                  <div className="flex items-center gap-1 text-gray-600">
                    <Boxes className="h-4 w-4" /> {cluster.rack_count} Racks
                  </div>
                  <div className="flex items-center gap-1 text-gray-600">
                    <ServerIcon className="h-4 w-4" /> {cluster.server_count} Servers
                  </div>
                  <div className="flex items-center gap-1 text-gray-600">
                    <Network className="h-4 w-4" /> {cluster.switch_count} Switches
                  </div>
                  <div className="col-span-3 mt-2 flex items-center gap-2">
                    <Badge variant="success">{cluster.online_count} Online</Badge>
                    {cluster.warning_count > 0 && (
                      <Badge variant="warning">{cluster.warning_count} Warning</Badge>
                    )}
                    <span className="ml-auto text-xs text-gray-400">
                      {cluster.last_refresh
                        ? `Refreshed ${new Date(cluster.last_refresh).toLocaleString()}`
                        : "Never refreshed"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          {clusters?.length === 0 && (
            <p className="text-sm text-gray-500">
              No clusters yet. An administrator can create one via the API or admin tools.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";

export function useClusters() {
  return useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
}

export function useCluster(clusterId: string) {
  return useQuery({
    queryKey: ["cluster", clusterId],
    queryFn: () => api.cluster(clusterId),
    enabled: Boolean(clusterId),
  });
}

export function useClusterRacks(clusterId: string) {
  return useQuery({
    queryKey: ["cluster", clusterId, "racks"],
    queryFn: () => api.clusterRacks(clusterId),
    enabled: Boolean(clusterId),
  });
}

export function useRackLayout(rackId: string) {
  return useQuery({
    queryKey: ["rack", rackId, "layout"],
    queryFn: () => api.rackLayout(rackId),
    enabled: Boolean(rackId),
  });
}

export function useDevice(deviceId: string) {
  return useQuery({
    queryKey: ["device", deviceId],
    queryFn: () => api.device(deviceId),
    enabled: Boolean(deviceId),
  });
}

export function useDeviceInventory(deviceId: string) {
  return useQuery({
    queryKey: ["device", deviceId, "inventory"],
    queryFn: () => api.deviceInventory(deviceId),
    enabled: Boolean(deviceId),
  });
}

export function useRefreshDevice(deviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.refreshDevice(deviceId),
    onSuccess: (inventory) => {
      queryClient.setQueryData(["device", deviceId, "inventory"], inventory);
      void queryClient.invalidateQueries({ queryKey: ["device", deviceId] });
    },
  });
}

export function useUsers() {
  return useQuery({ queryKey: ["users"], queryFn: api.users });
}

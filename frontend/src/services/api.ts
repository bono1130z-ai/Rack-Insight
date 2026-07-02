import { useAuthStore } from "@/stores/auth";
import type {
  ClusterSummary,
  Device,
  DeviceDetail,
  DeviceInventory,
  Me,
  RackLayout,
  RackSummary,
  TokenPair,
  User,
} from "@/types";

const API_BASE = "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function refreshTokens(): Promise<boolean> {
  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!refreshToken) return false;
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) {
    logout();
    return false;
  }
  const tokens = (await response.json()) as TokenPair;
  setTokens(tokens.access_token, tokens.refresh_token);
  return true;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const { accessToken } = useAuthStore.getState();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (response.status === 401 && retry && path !== "/auth/login") {
    const refreshed = await refreshTokens();
    if (refreshed) return request<T>(path, options, false);
    throw new ApiError(401, "Session expired");
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // keep statusText
    }
    throw new ApiError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<TokenPair>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<Me>("/auth/me"),

  clusters: () => request<ClusterSummary[]>("/clusters"),
  createCluster: (payload: { name: string; vendor?: string; description?: string }) =>
    request<ClusterSummary>("/clusters", { method: "POST", body: JSON.stringify(payload) }),
  deleteCluster: (id: string) => request<void>(`/clusters/${id}`, { method: "DELETE" }),
  clusterRacks: (clusterId: string) =>
    request<RackSummary[]>(`/clusters/${clusterId}/racks`),
  cluster: (clusterId: string) =>
    request<ClusterSummary>(`/clusters/${clusterId}`),

  createRack: (payload: {
    cluster_id: string;
    name: string;
    location?: string;
    height?: number;
  }) => request<RackSummary>("/racks", { method: "POST", body: JSON.stringify(payload) }),
  deleteRack: (id: string) => request<void>(`/racks/${id}`, { method: "DELETE" }),
  rackLayout: (rackId: string) => request<RackLayout>(`/racks/${rackId}/layout`),
  updateRackLayout: (
    rackId: string,
    units: { u_position: number; height: number; device_id: string | null }[],
  ) =>
    request<RackLayout>(`/racks/${rackId}/layout`, {
      method: "PUT",
      body: JSON.stringify({ units }),
    }),

  devices: (rackId?: string) =>
    request<Device[]>(`/devices${rackId ? `?rack_id=${rackId}` : ""}`),
  device: (deviceId: string) => request<DeviceDetail>(`/devices/${deviceId}`),
  createDevice: (payload: Record<string, unknown>) =>
    request<Device>("/devices", { method: "POST", body: JSON.stringify(payload) }),
  updateDevice: (deviceId: string, payload: Record<string, unknown>) =>
    request<Device>(`/devices/${deviceId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteDevice: (deviceId: string) =>
    request<void>(`/devices/${deviceId}`, { method: "DELETE" }),
  deviceInventory: (deviceId: string) =>
    request<DeviceInventory>(`/devices/${deviceId}/inventory`),
  refreshDevice: (deviceId: string) =>
    request<DeviceInventory>(`/devices/${deviceId}/refresh`, { method: "POST" }),

  users: () => request<User[]>("/users"),
  createUser: (payload: { username: string; password: string; role: string }) =>
    request<User>("/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (userId: string, payload: Record<string, unknown>) =>
    request<User>(`/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteUser: (userId: string) => request<void>(`/users/${userId}`, { method: "DELETE" }),
};

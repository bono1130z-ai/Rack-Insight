import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/layouts/AppLayout";
import { AuditLogPage } from "@/pages/admin/AuditLogPage";
import { ClusterManagementPage } from "@/pages/admin/ClusterManagementPage";
import { CollectorManagementPage } from "@/pages/admin/CollectorManagementPage";
import { CredentialManagementPage } from "@/pages/admin/CredentialManagementPage";
import { DeviceManagementPage } from "@/pages/admin/DeviceManagementPage";
import { DeviceTemplatesPage } from "@/pages/admin/DeviceTemplatesPage";
import { RackEditorPage } from "@/pages/admin/RackEditorPage";
import { RackManagementPage } from "@/pages/admin/RackManagementPage";
import { UserManagementPage } from "@/pages/admin/UserManagementPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { DeviceDetailPage } from "@/pages/DeviceDetailPage";
import { LoginPage } from "@/pages/LoginPage";
import { RackDetailPage } from "@/pages/RackDetailPage";
import { RackListPage } from "@/pages/RackListPage";
import { SearchPage } from "@/pages/SearchPage";
import { useAuthStore } from "@/stores/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/clusters/:clusterId" element={<RackListPage />} />
            <Route path="/racks/:rackId" element={<RackDetailPage />} />
            <Route
              path="/racks/:rackId/edit"
              element={
                <AdminRoute>
                  <RackEditorPage />
                </AdminRoute>
              }
            />
            <Route path="/devices/:deviceId" element={<DeviceDetailPage />} />
            <Route
              path="/admin/clusters"
              element={
                <AdminRoute>
                  <ClusterManagementPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/racks"
              element={
                <AdminRoute>
                  <RackManagementPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/device-templates"
              element={
                <AdminRoute>
                  <DeviceTemplatesPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/devices"
              element={
                <AdminRoute>
                  <DeviceManagementPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <AdminRoute>
                  <UserManagementPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/credentials"
              element={
                <AdminRoute>
                  <CredentialManagementPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/collectors"
              element={
                <AdminRoute>
                  <CollectorManagementPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/audit"
              element={
                <AdminRoute>
                  <AuditLogPage />
                </AdminRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

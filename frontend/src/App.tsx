import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/layouts/AppLayout";
import { RackEditorPage } from "@/pages/admin/RackEditorPage";
import { UserManagementPage } from "@/pages/admin/UserManagementPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { DeviceDetailPage } from "@/pages/DeviceDetailPage";
import { LoginPage } from "@/pages/LoginPage";
import { RackDetailPage } from "@/pages/RackDetailPage";
import { RackListPage } from "@/pages/RackListPage";
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
              path="/admin/users"
              element={
                <AdminRoute>
                  <UserManagementPage />
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

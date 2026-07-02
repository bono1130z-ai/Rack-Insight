import { LogOut, Server, UserCog } from "lucide-react";
import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth";

export function AppLayout() {
  const { accessToken, user, logout } = useAuthStore();
  const navigate = useNavigate();

  if (!accessToken) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-[1800px] items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-blue-700">
            <Server className="h-5 w-5" />
            Rack Insight
          </Link>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            {user?.role === "ADMIN" && (
              <Link
                to="/admin/users"
                className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-gray-100"
              >
                <UserCog className="h-4 w-4" /> Users
              </Link>
            )}
            {user && (
              <span>
                {user.username}
                <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs uppercase">
                  {user.role}
                </span>
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1800px] px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}

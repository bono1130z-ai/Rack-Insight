import {
  Activity,
  Boxes,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Search,
  Server,
  Settings,
  UserCog,
} from "lucide-react";
import { Link, Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth";

const ADMIN_MENU = [
  { to: "/admin/clusters", label: "Cluster Management", Icon: Boxes },
  { to: "/admin/racks", label: "Rack Management", Icon: Server },
  { to: "/admin/devices", label: "Device Management", Icon: HardDrive },
  { to: "/admin/users", label: "User Management", Icon: UserCog },
  { to: "/admin/credentials", label: "Credential Management", Icon: KeyRound },
  { to: "/admin/collectors", label: "Collector Management", Icon: Activity },
];

function SidebarLink({
  to,
  label,
  Icon,
}: {
  to: string;
  label: string;
  Icon: typeof Boxes;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
          isActive
            ? "bg-blue-600 font-medium text-white"
            : "text-gray-600 hover:bg-gray-100"
        }`
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export function AppLayout() {
  const { accessToken, user, logout } = useAuthStore();
  const navigate = useNavigate();

  if (!accessToken) return <Navigate to="/login" replace />;

  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="flex h-14 items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-blue-700">
            <Server className="h-5 w-5" />
            Rack Insight
          </Link>
          <div className="flex items-center gap-3 text-sm text-gray-600">
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

      <div className="flex flex-1">
        <aside className="w-60 shrink-0 border-r border-gray-200 bg-white p-3">
          <nav className="flex flex-col gap-1">
            <SidebarLink to="/" label="Dashboard" Icon={LayoutDashboard} />
            <SidebarLink to="/search" label="Inventory Search" Icon={Search} />
            {isAdmin && (
              <>
                <p className="mt-4 flex items-center gap-1.5 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <Settings className="h-3.5 w-3.5" /> Administration
                </p>
                {ADMIN_MENU.map((item) => (
                  <SidebarLink key={item.to} {...item} />
                ))}
              </>
            )}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-6 py-6">
          <div className="mx-auto max-w-[1700px]">
            <Outlet />
          </div>
        </main>
      </div>

      <Toaster />
    </div>
  );
}

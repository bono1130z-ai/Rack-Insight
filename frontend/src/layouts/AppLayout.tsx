import {
  Activity,
  Boxes,
  Cpu,
  HardDrive,
  KeyRound,
  KeySquare,
  LayoutDashboard,
  Link2,
  LogOut,
  Radar,
  Recycle,
  ScrollText,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth";

interface MenuItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  permission: string;
}

const TOP_MENU: MenuItem[] = [
  { to: "/", label: "Dashboard", Icon: LayoutDashboard, permission: "dashboard.view" },
  { to: "/search", label: "Inventory Search", Icon: Search, permission: "inventory.view" },
];

const ADMIN_MENU: MenuItem[] = [
  { to: "/admin/clusters", label: "Cluster Management", Icon: Boxes, permission: "cluster.view" },
  { to: "/admin/racks", label: "Rack Management", Icon: Server, permission: "rack.view" },
  { to: "/admin/device-templates", label: "Device Templates", Icon: Cpu, permission: "template.view" },
  { to: "/admin/devices", label: "Installed Devices", Icon: HardDrive, permission: "device.view" },
  { to: "/admin/credentials", label: "Credential Management", Icon: KeyRound, permission: "credential.view" },
  { to: "/admin/discovery", label: "SNMP Discovery", Icon: Radar, permission: "discovery.view" },
  { to: "/admin/collectors", label: "Collector Management", Icon: Activity, permission: "collector.view" },
  { to: "/admin/lifecycle", label: "Lifecycle & Retention", Icon: Recycle, permission: "lifecycle.view" },
  { to: "/admin/audit", label: "Audit Log", Icon: ScrollText, permission: "audit.view" },
];

const ACCESS_MENU: MenuItem[] = [
  { to: "/admin/users", label: "Users", Icon: Users, permission: "user.view" },
  { to: "/admin/user-groups", label: "User Groups", Icon: UsersRound, permission: "group.view" },
  { to: "/admin/roles", label: "Roles", Icon: ShieldCheck, permission: "role.view" },
  { to: "/admin/role-bindings", label: "Role Bindings", Icon: Link2, permission: "binding.view" },
  { to: "/admin/permissions", label: "Permissions", Icon: KeySquare, permission: "permission.view" },
];

function SidebarLink({ to, label, Icon }: { to: string; label: string; Icon: LucideIcon }) {
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

function MenuSection({
  label,
  Icon,
  items,
}: {
  label: string;
  Icon: LucideIcon;
  items: MenuItem[];
}) {
  if (items.length === 0) return null;
  return (
    <>
      <p className="mt-4 flex items-center gap-1.5 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      {items.map((item) => (
        <SidebarLink key={item.to} to={item.to} label={item.label} Icon={item.Icon} />
      ))}
    </>
  );
}

export function AppLayout() {
  const { accessToken, user, logout, hasPermission } = useAuthStore();
  const navigate = useNavigate();

  if (!accessToken) return <Navigate to="/login" replace />;

  const visible = (items: MenuItem[]) => items.filter((i) => hasPermission(i.permission));
  const topItems = visible(TOP_MENU);
  const adminItems = visible(ADMIN_MENU);
  const accessItems = visible(ACCESS_MENU);

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
                {user.display_name || user.username}
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
            {topItems.map((item) => (
              <SidebarLink key={item.to} to={item.to} label={item.label} Icon={item.Icon} />
            ))}
            <MenuSection label="Administration" Icon={Settings} items={adminItems} />
            <MenuSection label="Access Management" Icon={ShieldCheck} items={accessItems} />
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

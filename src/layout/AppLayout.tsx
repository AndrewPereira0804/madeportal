import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/authContext";
import useRoles from "../auth/useRoles";
import { AppShell, type AppShellNavItem } from "../components/ui";

const baseNavItems: AppShellNavItem[] = [
  { to: "/app", label: "Dashboard", description: "Overview", end: true },
  { to: "/app/scheduling", label: "Calendar", description: "Events" },
  { to: "/budget", label: "Budgets", description: "Finance" },
  { to: "/app/announcements", label: "Announcements", description: "Posts" },
  { to: "/app/directory", label: "Directory", description: "Members" },
  { to: "/app/account", label: "Account", description: "Profile" },
];

export default function AppLayout() {
  const { roles } = useRoles();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  const roleLabel = roles.length > 0 ? roles.join(", ") : "member";
  const navItems = roles.includes("admin")
    ? [...baseNavItems, { to: "/admin", label: "Admin", description: "Tools" }]
    : baseNavItems;

  return (
    <AppShell navItems={navItems} roleLabel={roleLabel} onLogout={handleLogout}>
      <Outlet />
    </AppShell>
  );
}

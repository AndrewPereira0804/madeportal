import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/authContext";
import {
  canAccessAllChairTools,
  canAccessChairTool,
  canAccessManagement,
  getChairRoleSlugs,
} from "../auth/roleAccess";
import useRoles from "../auth/useRoles";
import { AppShell, type AppShellNavItem } from "../components/ui";

const baseNavItems: AppShellNavItem[] = [
  { to: "/app", label: "Dashboard", description: "Overview", end: true },
  { to: "/app/scheduling", label: "Calendar", description: "Events" },
  { to: "/app/announcements", label: "Announcements", description: "Posts" },
  { to: "/app/directory", label: "Directory", description: "Members" },
  { to: "/app/account", label: "Account", description: "Profile" },
];

function getChairToolsPath(chairRoleSlugs: string[]) {
  return chairRoleSlugs.length === 1 ? `/app/tools/${chairRoleSlugs[0]}` : "/app/tools";
}

export default function AppLayout() {
  const { roles } = useRoles();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  const roleLabel = roles.length > 0 ? roles.join(", ") : "member";
  const canOpenAllChairTools = canAccessAllChairTools(roles);
  const accessibleChairRoleSlugs = getChairRoleSlugs(roles).filter((roleSlug) =>
    canAccessChairTool(roles, roleSlug)
  );
  const chairToolsNavItem: AppShellNavItem | null =
    canOpenAllChairTools || accessibleChairRoleSlugs.length > 0
      ? {
          to: canOpenAllChairTools ? "/app/tools" : getChairToolsPath(accessibleChairRoleSlugs),
          label: "Tools",
          description: canOpenAllChairTools ? "All chairs" : "Chair",
        }
      : null;
  const navItems = [
    ...baseNavItems.slice(0, 2),
    ...(chairToolsNavItem ? [chairToolsNavItem] : []),
    ...baseNavItems.slice(2),
    ...(canAccessManagement(roles) ? [{ to: "/app/manage", label: "Management", description: "Chapter" }] : []),
  ];

  return (
    <AppShell navItems={navItems} roleLabel={roleLabel} onLogout={handleLogout}>
      <Outlet />
    </AppShell>
  );
}

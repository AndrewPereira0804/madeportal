import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/authProvider";
import useRoles from "../auth/useRoles";
import { canManageMembers } from "../auth/roleAccess";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `nav-link app-nav-link${isActive ? " active" : ""}`;

export default function AppLayout() {
  const { roles } = useRoles();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const showMemberManagement = canManageMembers(roles);

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-layout">
      <nav className="navbar app-nav navbar-expand-lg">
        <div className="container-fluid px-3 py-2 gap-2">
          <div className="navbar-nav flex-row flex-wrap gap-1">
            <NavLink to="/app/scheduling" className={linkClass}>
              Scheduling
            </NavLink>
            <NavLink to="/app/budgets" className={linkClass}>
              Budgets
            </NavLink>
            <NavLink to="/app/announcements" className={linkClass}>
              Announcements
            </NavLink>
            <NavLink to="/app/directory" className={linkClass}>
              Directory
            </NavLink>
            {showMemberManagement && (
              <NavLink to="/app/members" className={linkClass}>
                Manage Members
              </NavLink>
            )}
            <NavLink to="/app/account" className={linkClass}>
              Account
            </NavLink>
            {roles.includes("admin") && (
              <NavLink to="/admin" className={linkClass}>
                Admin
              </NavLink>
            )}
          </div>

          <div className="ms-lg-auto d-flex align-items-center gap-2 flex-wrap">
            <span className="badge rounded-pill text-bg-light">
              Roles: {roles.join(", ") || "none"}
            </span>
            <button type="button" className="btn btn-outline-light btn-sm" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

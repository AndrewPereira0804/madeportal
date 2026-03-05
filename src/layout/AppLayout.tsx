// src/layout/AppLayout.tsx
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/authProvider";
import useRoles from "../auth/useRoles";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `app-nav-link${isActive ? " is-active" : ""}`;



export default function AppLayout() {
  const { roles, loading } = useRoles();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-layout">
      <nav className="app-nav">
        <NavLink to="/app/scheduling" className={linkClass}>Scheduling</NavLink>
        <NavLink to="/app/budgets" className={linkClass}>Budgets</NavLink>
        <NavLink to="/app/announcements" className={linkClass}>Announcements</NavLink>
        <NavLink to="/app/account" className={linkClass}>Account</NavLink>
        <button type="button" className="app-nav-link" onClick={handleLogout}>
          Logout
        </button>
        <div style={{ color: "white" }}>Roles: { roles.join(", ") }</div>
      </nav>
      <main className="app-main"><Outlet /></main>
    </div>
  );
}

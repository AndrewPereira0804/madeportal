import { NavLink, Outlet } from "react-router-dom";

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  padding: "8px 12px",
  borderRadius: 8,
  textDecoration: "none",
  color: "inherit",
  background: isActive ? "rgba(0,0,0,0.08)" : "transparent",
});

export default function AppLayout() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <nav
        style={{
          display: "flex",
          gap: 8,
          padding: 12,
          borderBottom: "1px solid rgba(0,0,0,0.1)",
        }}
      >
        <NavLink to="/app/scheduling" style={linkStyle}>
          Scheduling
        </NavLink>
        <NavLink to="/app/budgets" style={linkStyle}>
          Budgets
        </NavLink>
        <NavLink to="/app/announcements" style={linkStyle}>
          Announcements
        </NavLink>
        <NavLink to="/app/account" style={linkStyle}>
          Account
        </NavLink>
      </nav>

      <main style={{ padding: 16 }}>
        <Outlet />
      </main>
    </div>
  );
}
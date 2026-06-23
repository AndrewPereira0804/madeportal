import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/authProvider";
import useRoles from "../auth/useRoles";
import { Badge, Button, cx } from "../components/ui";

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
};

const navItems: NavItem[] = [
  { to: "/app/scheduling", label: "Scheduling" },
  { to: "/budget", label: "Budget" },
  { to: "/app/announcements", label: "Announcements" },
  { to: "/app/directory", label: "Directory" },
  { to: "/app/account", label: "Account" },
];

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cx("app-nav-link", isActive && "app-nav-link--active");
}

export default function AppLayout() {
  const { roles } = useRoles();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  const roleLabel = roles.length > 0 ? roles.join(", ") : "member";

  return (
    <div className="app-layout">
      <header className="app-layout__header">
        <div className="app-layout__bar">
          <div className="app-layout__brand-row">
            <Link to="/app/scheduling" className="app-layout__brand">
              <span className="app-layout__brand-mark" aria-hidden="true">
                Δ
              </span>
              <span className="app-layout__brand-text">
                <span className="app-layout__brand-name">Delta Portal</span>
                <span className="app-layout__brand-tagline">Sigma Alpha Epsilon · Massachusetts Delta</span>
              </span>
            </Link>

            <div className="app-layout__toolbar">
              <Badge variant="neutral" className="app-layout__roles app-layout__roles--mobile">
                {roleLabel}
              </Badge>
              <Button
                type="button"
                variant="outline-light"
                size="sm"
                className="app-layout__logout app-layout__logout--mobile"
                onClick={handleLogout}
              >
                Logout
              </Button>
              <button
                type="button"
                className="app-layout__menu-toggle"
                aria-expanded={menuOpen}
                aria-controls="app-primary-nav"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="app-layout__menu-toggle-label">{menuOpen ? "Close" : "Menu"}</span>
              </button>
            </div>
          </div>

          <nav
            id="app-primary-nav"
            className={cx("app-layout__nav", menuOpen && "app-layout__nav--open")}
            aria-label="Primary"
          >
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                {item.label}
              </NavLink>
            ))}
            {roles.includes("admin") && (
              <NavLink to="/admin" className={navLinkClass}>
                Admin
              </NavLink>
            )}
          </nav>

          <div className="app-layout__meta">
            <Badge variant="neutral" className="app-layout__roles app-layout__roles--desktop">
              {roleLabel}
            </Badge>
            <Button type="button" variant="outline-light" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="app-layout__main">
        <Outlet />
      </main>
    </div>
  );
}

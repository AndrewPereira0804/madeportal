import { useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import Badge from "./Badge";
import Button from "./Button";
import { cx } from "./utils";

export type AppShellNavItem = {
  to: string;
  label: string;
  description?: string;
  end?: boolean;
};

export type AppShellProps = {
  children: ReactNode;
  navItems: AppShellNavItem[];
  brandName?: string;
  brandKicker?: string;
  roleLabel: string;
  onLogout: () => void;
};

function navClass({ isActive }: { isActive: boolean }) {
  return cx("app-shell__nav-link", isActive && "app-shell__nav-link--active");
}

export default function AppShell({
  children,
  navItems,
  brandName = "Chapter Portal",
  brandKicker = "Operations",
  roleLabel,
  onLogout,
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={cx("app-shell", collapsed && "app-shell--collapsed")}>
      <aside id="portal-sidebar" className={cx("app-shell__sidebar", menuOpen && "app-shell__sidebar--open")}>
        <div className="app-shell__brand-area">
          <Link to="/app" className="app-shell__brand" onClick={() => setMenuOpen(false)}>
            <span className="app-shell__brand-mark app-shell__brand-mark--crest" aria-hidden="true">
              <img className="app-shell__brand-crest" src="/sae-crest.png" alt="" />
            </span>
            <span className="app-shell__brand-copy">
              <span className="app-shell__brand-kicker">{brandKicker}</span>
              <span className="app-shell__brand-name">{brandName}</span>
            </span>
          </Link>
        </div>

        <nav className="app-shell__nav" aria-label="Primary">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={navClass}
              onClick={() => setMenuOpen(false)}
              title={collapsed ? item.label : undefined}
            >
              <span className="app-shell__nav-initial" aria-hidden="true">
                {item.label.slice(0, 1)}
              </span>
              <span className="app-shell__nav-label">{item.label}</span>
              {item.description && <span className="app-shell__nav-description">{item.description}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="app-shell__profile">
          <span className="app-shell__profile-label">Signed in as</span>
          <Badge variant="neutral" className="app-shell__role-badge">
            {roleLabel}
          </Badge>
          <Button type="button" variant="outline-light" size="sm" onClick={onLogout}>
            Logout
          </Button>
        </div>
      </aside>

      <button
        type="button"
        className="app-shell__collapse-button"
        aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
        aria-controls="portal-sidebar"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>

      <div className="app-shell__mobile-bar">
        <Link to="/app" className="app-shell__mobile-brand" onClick={() => setMenuOpen(false)}>
          <span className="app-shell__brand-mark app-shell__brand-mark--crest" aria-hidden="true">
            <img className="app-shell__brand-crest" src="/sae-crest.png" alt="" />
          </span>
          <span>Chapter Portal</span>
        </Link>
        <button
          type="button"
          className="app-shell__menu-button"
          aria-expanded={menuOpen}
          aria-controls="portal-sidebar"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </div>

      {menuOpen && <button type="button" className="app-shell__scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}

      <main className="app-shell__main">
        <div className="app-shell__content">{children}</div>
      </main>
    </div>
  );
}

import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import useRoles from "../../auth/useRoles";
import { useAuth } from "../../auth/authProvider";

export default function Admin() {
  const { signOut } = useAuth();
  const { roles, loading } = useRoles();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  if (loading) {
    return (
      <div className="theme-shell">
        <section className="theme-card admin-console p-4 p-md-5">
          <div className="d-flex align-items-center gap-2">
            <div className="spinner-border spinner-border-sm text-primary" role="status" />
            <span>Loading admin...</span>
          </div>
        </section>
      </div>
    );
  }

  if (!roles.includes("admin")) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="theme-shell">
      <section className="theme-card admin-console p-4 p-md-5">
        <div className="admin-hero">
          <div>
            <span className="admin-eyebrow">Admin console</span>
            <h1 className="page-title">Admin</h1>
            <p className="page-subtitle mb-0">Manage member access, budget operations, and event setup.</p>
          </div>

          <div className="admin-utility-actions">
            <Link to="/app" className="btn btn-outline-secondary">
              Return to App
            </Link>
            <button type="button" className="btn btn-outline-dark" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>

        <div className="admin-action-grid" aria-label="Admin sections">
          <Link to="accounts" className="admin-action-button">
            <span className="admin-action-label">Manage Members</span>
            <span className="admin-action-copy">Approve accounts, update statuses, and assign roles.</span>
          </Link>
          <Link to="/budget/admin" className="admin-action-button">
            <span className="admin-action-label">Budget Admin</span>
            <span className="admin-action-copy">Review expense requests and manage budget cycles.</span>
          </Link>
          <Link to="events" className="admin-action-button">
            <span className="admin-action-label">Manage Events</span>
            <span className="admin-action-copy">Create and prepare scheduling updates.</span>
          </Link>
        </div>

        <div className="admin-outlet">
          <Outlet />
        </div>
      </section>
    </div>
  );
}

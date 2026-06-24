import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import useRoles from "../../auth/useRoles";
import { useAuth } from "../../auth/authContext";
import {
  canAccessManagement,
  canManageEvents,
  canManageMembers,
} from "../../auth/roleAccess";

export default function Management() {
  const { session, loading: authLoading, signOut } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const navigate = useNavigate();
  const hasManagementAccess = canAccessManagement(roles);
  const hasMemberManagementAccess = canManageMembers(roles);
  const hasEventManagementAccess = canManageEvents(roles);

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  if (authLoading || rolesLoading) {
    return (
      <div className="theme-shell admin-shell">
        <section className="theme-card admin-console p-4 p-md-5">
          <div className="d-flex align-items-center gap-2">
            <div className="spinner-border spinner-border-sm text-primary" role="status" />
            <span>Loading management...</span>
          </div>
        </section>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!hasManagementAccess) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="theme-shell admin-shell">
      <section className="theme-card admin-console p-4 p-md-5">
        <div className="admin-hero">
          <div>
            <span className="admin-eyebrow">Chapter operations</span>
            <h1 className="page-title">Management</h1>
            <p className="page-subtitle mb-0">Manage member access, role assignments, and chapter operations.</p>
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

        <div className="admin-action-grid" aria-label="Management sections">
          {hasMemberManagementAccess && (
            <Link to="members" className="admin-action-button">
              <span className="admin-action-label">Manage Members</span>
              <span className="admin-action-copy">Approve accounts, update statuses, and assign roles.</span>
            </Link>
          )}
          {hasEventManagementAccess && (
            <Link to="/app/events/manage" className="admin-action-button">
              <span className="admin-action-label">Manage Events</span>
              <span className="admin-action-copy">Create and prepare scheduling updates.</span>
            </Link>
          )}
        </div>

        <div className="admin-outlet">
          <Outlet />
        </div>
      </section>
    </div>
  );
}

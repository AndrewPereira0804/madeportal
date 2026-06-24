import { useAuth } from "../auth/authContext";
import { canAccessManagement } from "../auth/roleAccess";
import { Navigate } from "react-router-dom";
import useRoles from "../auth/useRoles";
import { useStatus } from "../auth/useStatus";
import { Button } from "../components/ui";

export default function Home() {
  const { session, signOut } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const { status, loading: statusLoading } = useStatus();
  
  const hasManagementAccess = canAccessManagement(roles);

  if (!rolesLoading && hasManagementAccess) {
    return <Navigate to="/app/manage" replace />;
  }

  if(!statusLoading && status == "active") {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="theme-shell">
      <section className="theme-card p-4 p-md-5">
        <h1 className="page-title">Chapter Portal</h1>
        <p className="page-subtitle mt-3">
          Private chapter operations for scheduling, announcements, budgets, roles, and member tools.
        </p>

        <div className="d-flex flex-wrap gap-2 mt-4">
          <Button to="/login">
            Login
          </Button>
          <Button to="/register" variant="outline-secondary">
            Register
          </Button>
          <Button to="/app" variant="outline-secondary">
            App
          </Button>
          {hasManagementAccess && (
            <Button to="/app/manage" variant="outline-gold">
              Management
            </Button>
          )}
          {session && (
            <Button type="button" variant="outline-dark" onClick={signOut}>
              Logout
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

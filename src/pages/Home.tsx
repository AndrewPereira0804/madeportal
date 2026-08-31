import { useAuth } from "../auth/authContext";
import { canAccessApp, canAccessManagement } from "../auth/roleAccess";
import { Navigate } from "react-router-dom";
import useRoles from "../auth/useRoles";
import { useStatus } from "../auth/useStatus";
import { Button } from "../components/ui";
import { isDemoEnvironment } from "../config/appEnvironment";

function registerDisplay() {
  if (!isDemoEnvironment) {
    return <Button to="/register" variant="outline-secondary">Register</Button>
  }else{
    return null
  }
}

export default function Home() {
  const { session, signOut } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const { status, loading: statusLoading } = useStatus();
  
  const hasAppAccess = canAccessApp(status, roles);
  const hasManagementAccess = canAccessManagement(roles);

  if (!rolesLoading && hasAppAccess && hasManagementAccess) {
    return <Navigate to="/app/manage" replace />;
  }

  if (!statusLoading && !rolesLoading && status === "active" && !hasAppAccess) {
    return <Navigate to="/access-needed" replace />;
  }

  if(!statusLoading && !rolesLoading && hasAppAccess) {
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
          {
          registerDisplay()
          }
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

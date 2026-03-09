import { useAuth } from "../auth/authProvider";
import { Link, Navigate } from "react-router-dom";
import useRoles from "../auth/useRoles";
import { useStatus } from "../auth/useStatus";

export default function Home() {
  const { session, signOut } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const { status, loading: statusLoading } = useStatus();
  
  if (!rolesLoading && roles.includes("admin")) {
    return <Navigate to="/admin" replace />;
  }

  if(!statusLoading && status == "active") {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="theme-shell">
      <section className="theme-card p-4 p-md-5">
        <h1 className="page-title">Welcome to the SAE Massachusetts Delta Portal</h1>
        <p className="page-subtitle mt-3">
          Use the links below to sign in, register, or jump into the app.
        </p>

        <div className="d-flex flex-wrap gap-2 mt-4">
          <Link to="/login" className="btn btn-primary">
            Login
          </Link>
          <Link to="/register" className="btn btn-outline-secondary">
            Register
          </Link>
          <Link to="/app" className="btn btn-outline-secondary">
            App
          </Link>
          {roles.includes("admin") && (
            <Link to="/admin" className="btn btn-outline-gold">
              Admin
            </Link>
          )}
          {session && (
            <button type="button" className="btn btn-outline-dark" onClick={signOut}>
              Logout
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

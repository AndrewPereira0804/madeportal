import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./authContext";

export default function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="theme-shell">
        <div className="theme-card p-4 d-flex align-items-center gap-2">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

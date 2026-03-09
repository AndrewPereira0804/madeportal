import { Link, Outlet } from "react-router-dom";
import useRoles from "../../auth/useRoles";
import { useAuth } from "../../auth/authProvider";
import { Navigate } from "react-router-dom";


export default function Admin() {
  const { signOut } = useAuth();
  const { roles, loading } = useRoles();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!roles.includes("admin")) {
    return <Navigate to="/" replace />;
  }
  return (
    <div className="theme-shell">
      <section className="theme-card p-4 p-md-5">
        <h1 className="page-title">Admin</h1>
        <p className="page-subtitle mt-2">Manage membership and account access.</p>

        <div className="d-flex flex-wrap gap-2 mt-4">
          <Link to="accounts" className="btn btn-primary">
            Manage Accounts
          </Link>
          <button type="button" className="btn btn-outline-dark" onClick={signOut}>
            Logout
          </button>
        </div>

        <div className="mt-4">
          <Outlet />
        </div>
      </section>
    </div>
  );
}

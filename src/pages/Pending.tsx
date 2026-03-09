import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/authProvider";

export default function Pending() {
  const { signOut, session } = useAuth();
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return (
    <div className="theme-shell">
      <section className="theme-card text-center p-4 p-md-5">
        <h1 className="page-title">Account Pending</h1>
        <p className="page-subtitle mt-3">Contact an admin to be allowed access to the site.</p>
        <button type="button" className="btn btn-outline-dark mt-4" onClick={signOut}>
          Logout
        </button>
      </section>
    </div>
  );
}

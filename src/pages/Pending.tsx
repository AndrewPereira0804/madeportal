import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/authContext";
import { Button } from "../components/ui";

export default function Pending() {
  const { signOut, session } = useAuth();
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return (
    <div className="theme-shell">
      <section className="theme-card text-center p-4 p-md-5">
        <h1 className="page-title">Access pending</h1>
        <p className="page-subtitle mt-3">Your account exists, but chapter access still needs approval from an administrator.</p>
        <Button type="button" variant="outline-dark" className="mt-4" onClick={signOut}>
          Logout
        </Button>
      </section>
    </div>
  );
}

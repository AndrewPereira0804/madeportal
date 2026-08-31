import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/authContext";
import { Button } from "../components/ui";

export default function AccessNeeded() {
  const { session, signOut } = useAuth();

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="theme-shell">
      <section className="theme-card text-center p-4 p-md-5">
        <h1 className="page-title">Access needs a role</h1>
        <p className="page-subtitle mt-3">
          Your account is active, but a chapter access role still needs to be assigned.
        </p>
        <Button type="button" variant="outline-dark" className="mt-4" onClick={signOut}>
          Logout
        </Button>
      </section>
    </div>
  );
}

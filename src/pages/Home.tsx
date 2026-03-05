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
    <>
      <h1>Welcome to the SAE Massachussetts Delta Portal</h1>

      <p>
        Try: <Link to="/login">Login</Link> |{" "}
        <Link to="/register">Register</Link> | <Link to="/app">App</Link>
      </p>
      {roles.includes("admin") && (
        <p>
          <Link to="/admin">Go to Admin Page</Link>
        </p>
      )}
      {session && (
        <button onClick={signOut}>
          Logout
        </button>
      )}
    </>
  );
}

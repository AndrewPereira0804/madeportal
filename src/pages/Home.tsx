// at the top of Home.tsx
import { useAuth } from "../auth/authProvider";   // <-- grab the hook
import { Link } from "react-router-dom";         // <-- for navigation links
import useRoles from "../auth/useRoles";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

export default function Home() {
  const { session, signOut } = useAuth();        // session==null when no user
  const roles = useRoles();                         // now an array
  const nav = useNavigate();
  const location = useLocation() as any;
  const from = location.state?.from || "/";
  

  return (
    <>
      <h1>Home</h1>

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
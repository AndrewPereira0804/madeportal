// at the top of Home.tsx
import { useAuth } from "../auth/authProvider";   // <-- grab the hook
import { Link } from "react-router-dom";         // <-- for navigation links

export default function Home() {
  const { session, signOut } = useAuth();        // session==null when no user

  return (
    <>
      <h1>Home</h1>

      <p>
        Try: <Link to="/login">Login</Link> |{" "}
        <Link to="/register">Register</Link> | <Link to="/app">App</Link>
      </p>

      {session && (
        <button onClick={signOut}>
          Logout
        </button>
      )}
    </>
  );
}
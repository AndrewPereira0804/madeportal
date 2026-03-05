import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/authProvider";

export default function Pending() {
  const { signOut } = useAuth();
  const session = useAuth().session;
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return (
    <div style={{ textAlign: "center", marginTop: "2rem" }}>
      <h1>Account Pending</h1>
      <p>Contact an admin to be allowed access to the site.</p>
      <button onClick={signOut}>
          Logout
        </button>
    </div>
  );
}

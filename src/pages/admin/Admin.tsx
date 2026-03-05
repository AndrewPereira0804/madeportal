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
    <>
      <h1>Admin</h1>
      <p>This is the admin page.</p>
      {/* relative link so it works in nested routes */}
      <Link to="accounts">Manage Accounts</Link>
      <Outlet />
      <button onClick={signOut}>
          Logout
        </button>
    </>
  );
}

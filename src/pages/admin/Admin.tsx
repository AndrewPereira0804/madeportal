import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../../auth/authProvider";

export default function Admin() {
  const { signOut } = useAuth();
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

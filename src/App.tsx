import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Pending from "./pages/Pending";
import Admin from "./pages/admin/Admin";
import NotFound from "./pages/NotFound";
import AppLayout from "./layout/AppLayout";
import Scheduling from "./pages/app/Scheduling";
import Budgets from "./pages/app/Budgets";
import Announcements from "./pages/app/Announcements";
import Account from "./pages/app/Account";
import { useAuth } from "./auth/authProvider";
import RequireAuth from "./auth/requireAuth";
import { useStatus } from "./auth/useStatus";
import Suspended from "./pages/Suspended";
import Accounts from "./pages/admin/Accounts";

// (the earlier test code used useAuth incorrectly and ran at module scope;
// drop it – you can add runtime checks in a useEffect inside a component if
// you really need to verify connectivity)


export default function App() {
  const { session, loading: authLoading } = useAuth();
  const { status, loading: statusLoading } = useStatus();
  const location = useLocation();

  // don't render anything until we know the profile status as well as auth
  if (authLoading || statusLoading) return <div>Loading...</div>;

  // if the authenticated user's profile has a pending status, redirect (but
  // don't redirect if we're already on the pending page or there is no session)
  if (
    session &&
    status === "pending" &&
    location.pathname !== "/pending"
  ) {
    return <Navigate to="/pending" replace />;
  }

  if (
    session &&
    status === "suspended" &&
    location.pathname !== "/suspended"
  ) {
    return <Navigate to="/suspended" replace />;
  }
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/pending" element={<Pending />} />
      <Route path="/suspended" element={<Suspended />} />
      <Route path="/admin" element={<Admin />}>                      
        {/* show something when /admin is visited; avoid re‑rendering <Admin /> inside
            itself which caused the double render. */}
        <Route
          index
          element={<h2 style={{ padding: "1rem" }}>Select an admin section</h2>}
        />
        <Route path="accounts" element={<Accounts />} />
      </Route>

      {/* /app/* section with navbar */}
      <Route element={<RequireAuth />}>
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Navigate to="scheduling" replace />} />
        <Route path="scheduling" element={<Scheduling />} />
        <Route path="budgets" element={<Budgets />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="account" element={<Account />} />
      </Route>
      
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

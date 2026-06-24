import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Pending from "./pages/Pending";
import Admin from "./pages/admin/Admin";
import NotFound from "./pages/NotFound";
import AppLayout from "./layout/AppLayout";
import Dashboard from "./pages/app/Dashboard";
import Scheduling from "./pages/app/Scheduling";
import Announcements from "./pages/app/Announcements";
import Account from "./pages/app/Account";
import MemberDirectory from "./pages/app/MemberDirectory";
import { useAuth } from "./auth/authContext";
import RequireAuth from "./auth/requireAuth";
import { useStatus } from "./auth/useStatus";
import Suspended from "./pages/Suspended";
import Accounts from "./pages/admin/Accounts";
import CreateEvent from "./pages/admin/CreateEvent";
import CreateAnnouncement from "./pages/app/CreateAnnouncement";
import EditAnnouncement from "./pages/app/EditAnnouncement";
import ManageEvents from "./pages/app/ManageEvents";
import BudgetPage from "./pages/budget/BudgetPage";
import BudgetAccountPage from "./pages/budget/BudgetAccountPage";
import BudgetAdminPage from "./pages/BudgetAdminPage";
import SplashScreen from "./components/ui/SplashScreen";

export default function App() {
  const [splashComplete, setSplashComplete] = useState(false);
  const { session, loading: authLoading } = useAuth();
  const { status, loading: statusLoading } = useStatus();
  const location = useLocation();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSplashComplete(true);
    }, 2400);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  if (!splashComplete) {
    return <SplashScreen />;
  }

  if (authLoading || statusLoading) {
    return (
      <div className="theme-shell">
        <div className="theme-card p-4">
          <div className="d-flex align-items-center gap-2">
            <div className="spinner-border spinner-border-sm text-primary" role="status" />
            <span>Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (session && status === "pending" && location.pathname !== "/pending") {
    return <Navigate to="/pending" replace />;
  }

  if (session && status === "suspended" && location.pathname !== "/suspended") {
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
        <Route index element={null} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="events" element={<CreateEvent />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="scheduling" element={<Scheduling />} />
          <Route path="events/manage" element={<ManageEvents />} />
          <Route path="directory" element={<MemberDirectory />} />
          <Route path="members" element={<Accounts />} />
          <Route path="budgets" element={<Navigate to="/budget" replace />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="announcements/create" element={<CreateAnnouncement />} />
          <Route path="announcements/:announcementId/edit" element={<EditAnnouncement />} />
          <Route path="account" element={<Account />} />
        </Route>
        <Route path="/budget" element={<AppLayout />}>
          <Route index element={<BudgetPage />} />
          <Route path="admin" element={<BudgetAdminPage />} />
          <Route path=":accountId" element={<BudgetAccountPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

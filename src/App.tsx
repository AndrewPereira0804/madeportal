import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Pending from "./pages/Pending";
import Management from "./pages/app/Management";
import SystemAdmin from "./pages/app/SystemAdmin";
import NotFound from "./pages/NotFound";
import AppLayout from "./layout/AppLayout";
import Dashboard from "./pages/app/Dashboard";
import Scheduling from "./pages/app/Scheduling";
import Announcements from "./pages/app/Announcements";
import Account from "./pages/app/Account";
import MemberDirectory from "./pages/app/MemberDirectory";
import { useAuth } from "./auth/authContext";
import RequireAuth from "./auth/requireAuth";
import { getStatusRedirectPath } from "./auth/roleAccess";
import { useStatus } from "./auth/useStatus";
import Suspended from "./pages/Suspended";
import ManageMembers from "./pages/app/ManageMembers";
import CreateAnnouncement from "./pages/app/CreateAnnouncement";
import EditAnnouncement from "./pages/app/EditAnnouncement";
import ManageEvents from "./pages/app/ManageEvents";
import BudgetPage from "./pages/budget/BudgetPage";
import BudgetAccountPage from "./pages/budget/BudgetAccountPage";
import BudgetAdminPage from "./pages/BudgetAdminPage";
import SplashScreen from "./components/ui/SplashScreen";
import { ChairToolPage, ChairToolsIndex } from "./pages/app/tools/ChairTools";

function LegacyBudgetAccountRedirect() {
  const { accountId } = useParams<{ accountId: string }>();
  return <Navigate to={accountId ? `/app/budget/${accountId}` : "/app/budget"} replace />;
}

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

  const statusRedirectPath = session ? getStatusRedirectPath(status, location.pathname) : null;
  if (statusRedirectPath) {
    return <Navigate to={statusRedirectPath} replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/pending" element={<Pending />} />
      <Route path="/suspended" element={<Suspended />} />
      <Route path="/admin" element={<Navigate to="/app/manage" replace />} />
      <Route path="/admin/accounts" element={<Navigate to="/app/manage/members" replace />} />
      <Route path="/admin/events" element={<Navigate to="/app/events/manage" replace />} />
      <Route path="/budget" element={<Navigate to="/app/budget" replace />} />
      <Route path="/budget/admin" element={<Navigate to="/app/budget/admin" replace />} />
      <Route path="/budget/:accountId" element={<LegacyBudgetAccountRedirect />} />

      <Route element={<RequireAuth />}>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="scheduling" element={<Scheduling />} />
          <Route path="events/manage" element={<ManageEvents />} />
          <Route path="tools" element={<ChairToolsIndex />} />
          <Route path="tools/:roleSlug/*" element={<ChairToolPage />} />
          <Route path="directory" element={<MemberDirectory />} />
          <Route path="manage" element={<Management />}>
            <Route index element={null} />
            <Route path="members" element={<ManageMembers />} />
            <Route path="events" element={<Navigate to="/app/events/manage" replace />} />
          </Route>
          <Route path="members" element={<Navigate to="/app/manage/members" replace />} />
          <Route path="budget" element={<BudgetPage />} />
          <Route path="budget/admin" element={<BudgetAdminPage />} />
          <Route path="budget/:accountId" element={<BudgetAccountPage />} />
          <Route path="budgets" element={<Navigate to="/app/budget" replace />} />
          <Route path="admin" element={<Navigate to="/app/system-admin" replace />} />
          <Route path="system-admin" element={<SystemAdmin />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="announcements/create" element={<CreateAnnouncement />} />
          <Route path="announcements/:announcementId/edit" element={<EditAnnouncement />} />
          <Route path="account" element={<Account />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

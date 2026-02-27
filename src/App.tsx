import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Pending from "./pages/Pending";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import AppLayout from "./layout/AppLayout";
import Scheduling from "./pages/app/Scheduling";
import Budgets from "./pages/app/Budgets";
import Announcements from "./pages/app/Announcements";
import Account from "./pages/app/Account";
import supabase from './config/supabaseClient';
import { useAuth } from "./auth/authProvider";
import RequireAuth from "./auth/requireAuth";

// Test connection on app load
supabase.auth.getSession().then(({ data, error }) => {
  if (error) {
    console.error('❌ Supabase error:', error.message);
  } else {
    console.log('✅ Supabase connected successfully!');
  }
});

export default function App() {
  const { session, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/pending" element={<Pending />} />
      <Route path="/admin" element={<Admin />} />

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
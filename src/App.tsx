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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/pending" element={<Pending />} />
      <Route path="/admin" element={<Admin />} />

      {/* /app/* section with navbar */}
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Navigate to="scheduling" replace />} />
        <Route path="scheduling" element={<Scheduling />} />
        <Route path="budgets" element={<Budgets />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="account" element={<Account />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
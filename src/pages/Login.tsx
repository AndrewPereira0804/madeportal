import { useForm } from "react-hook-form";
import { useState } from "react";
import supabase from "../config/supabaseClient";
import { useAuth } from "../auth/authContext";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { isDemoEnvironment } from "../config/appEnvironment";
import { Button, Input } from "../components/ui";

type LoginLocationState = {
    from?: string;
    notice?: string;
};

export default function Login() {
    const { session } = useAuth();
    const nav = useNavigate();
    const location = useLocation();
    const loginState = location.state as LoginLocationState | null;
    const from = loginState?.from || "/";
    const notice = loginState?.notice;
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const { register, handleSubmit, formState: { errors } } = useForm<{ email: string; password: string }>();

    const onSubmit = async (formData: { email: string; password: string }) => {
        setErrorMessage(null);
        const { data, error } = await supabase.auth.signInWithPassword({
    email: formData.email,
    password: formData.password,
});

    if (error) {
        setErrorMessage("Login failed: " + error.message);
        return;
    }
    if (data.session) {
        nav(from, { replace: true });
    }
    };
    if (session) return <Navigate to={from} replace />;

    function handleDemoLogin() {
      if (isDemoEnvironment) {
        return <p> There are 3 demo users. admin@example.com, treasurer@example.com, member@example.com. The password is 'password' for all three.</p>
      }
    }

  return (
    <div className="theme-shell d-flex justify-content-center">
      <section className="theme-card auth-wrap p-4 p-md-5 w-100">
        <h1 className="page-title">Login</h1>
        <p className="page-subtitle mt-2">Enter your account credentials.</p>
        {notice && <div className="alert alert-success mt-3 mb-0">{notice}</div>}
        {errorMessage && <div className="alert alert-danger mt-3 mb-0">{errorMessage}</div>}

        <form className="mt-4 d-grid gap-3" onSubmit={handleSubmit(onSubmit)}>
          <Input
            type="email"
            label="Email"
            error={errors.email ? "Email is required." : undefined}
            {...register("email", { required: true })}
            placeholder="Email"
          />

          <Input
            type="password"
            label="Password"
            error={errors.password ? "Password is required." : undefined}
            {...register("password", { required: true })}
            placeholder="Password"
          />
          {handleDemoLogin()}
          <Button type="submit">
            Login
          </Button>
        </form>
      </section>
    </div>
  );
}

import { useForm } from "react-hook-form";
import supabase from "../config/supabaseClient";
import { useAuth } from "../auth/authProvider";
import { Navigate, useLocation, useNavigate } from "react-router-dom";


export default function Login() {
    const { session } = useAuth();
    const nav = useNavigate();
    const location = useLocation() as any;
    const from = location.state?.from || "/";
    const { register, handleSubmit, formState: { errors } } = useForm<{ email: string; password: string }>();

    const onSubmit = async (formData: { email: string; password: string }) => {
        const { data, error } = await supabase.auth.signInWithPassword({
    email: formData.email,
    password: formData.password,
});

  console.log("login:", { session: data.session, user: data.user, error });

    if (error) {
        alert("Login failed: " + error.message);
    }
    if (data.session) {
        alert("Login successful!");
        nav(from, { replace: true });
    }
    };
    if (session) return <Navigate to={from} replace />;
  return (
    <div className="theme-shell d-flex justify-content-center">
      <section className="theme-card auth-wrap p-4 p-md-5 w-100">
        <h1 className="page-title">Login</h1>
        <p className="page-subtitle mt-2">Enter your account credentials.</p>

        <form className="mt-4 d-grid gap-3" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <input
              type="email"
              className="form-control"
              {...register("email", { required: true })}
              placeholder="Email"
            />
            {errors.email && <div className="form-error mt-1">Email is required.</div>}
          </div>

          <div>
            <input
              type="password"
              className="form-control"
              {...register("password", { required: true })}
              placeholder="Password"
            />
            {errors.password && <div className="form-error mt-1">Password is required.</div>}
          </div>

          <button type="submit" className="btn btn-primary">
            Login
          </button>
        </form>
      </section>
    </div>
  );
}

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
  return <>
            <h1>Login Form</h1>

            <form className="App" onSubmit={handleSubmit(onSubmit)}>
                <input
                    type="email"
                    {...register("email", { required: true })}
                    placeholder="Email"
                />
                {errors.email && <span style={{ color: "red" }}>*Email* is mandatory</span>}
                \n
                <input
                    type="password"
                    {...register("password", { required: true })}
                    placeholder="Password"
                />
                {errors.password && <span style={{ color: "red" }}>*Password* is mandatory</span>}
                \n
                <button type="submit">Login</button>
                
            </form>
        </>
}
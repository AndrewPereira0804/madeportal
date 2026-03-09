import { useState } from "react";
import { useForm } from "react-hook-form";
import type { SubmitHandler } from "react-hook-form";
import supabase from "../config/supabaseClient";
import { useAuth } from "../auth/authProvider";
import { Navigate, useNavigate } from "react-router-dom";

type FormValues = {
  name: string;
  email: string;
  password: string;
  repeatPassword: string;
};

async function createPendingProfile(userId: string, name: string, email: string) {
  const { error } = await supabase.from("profiles").insert({
    user_id: userId,
    name,
    email,
    status: "pending",
  });

  return error;
}

export default function Register() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    setErrorMessage(null);
    const name = values.name.trim();
    const email = values.email.trim();

    if (!name) {
      setErrorMessage("Name is required");
      return;
    }

    if (!email) {
      setErrorMessage("Email is required");
      return;
    }

    if (values.password !== values.repeatPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password: values.password,
      options: {
        data: {
          name,
        },
      },
    });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    // if a profiles table exists and you want to mark the account pending
    if (data.user) {
      const profileError = await createPendingProfile(data.user.id, name, email);
      if (profileError) {
        setErrorMessage(profileError.message);
        return;
      }
    }

    // redirect or show a message; supabase sends confirmation email by default
    navigate("/pending");
  };

  // already logged in? send them away
  if (session) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="theme-shell d-flex justify-content-center">
      <section className="theme-card auth-wrap p-4 p-md-5 w-100">
        <h1 className="page-title">Register</h1>
        <p className="page-subtitle mt-2">Create an account for portal access.</p>
        {errorMessage && <div className="alert alert-danger mt-3 mb-0">{errorMessage}</div>}

        <form className="mt-4 d-grid gap-3" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <input
              type="text"
              className="form-control"
              {...register("name", { required: "Name is required" })}
              placeholder="Name"
            />
            {errors.name && <div className="form-error mt-1">{errors.name.message}</div>}
          </div>

          <div>
            <input
              type="email"
              className="form-control"
              {...register("email", { required: "Email is required" })}
              placeholder="Email"
            />
            {errors.email && <div className="form-error mt-1">{errors.email.message}</div>}
          </div>

          <div>
            <input
              type="password"
              className="form-control"
              {...register("password", { required: "Password is required" })}
              placeholder="Password"
            />
            {errors.password && <div className="form-error mt-1">{errors.password.message}</div>}
          </div>

          <div>
            <input
              type="password"
              className="form-control"
              {...register("repeatPassword", {
                required: "Repeat password is required",
              })}
              placeholder="Repeat Password"
            />
            {errors.repeatPassword && (
              <div className="form-error mt-1">{errors.repeatPassword.message}</div>
            )}
          </div>

          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            Register
          </button>
        </form>
      </section>
    </div>
  );
}


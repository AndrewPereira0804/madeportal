import { useState } from "react";
import { useForm } from "react-hook-form";
import type { SubmitHandler } from "react-hook-form";
import supabase from "../config/supabaseClient";
import { useAuth } from "../auth/authContext";
import { Navigate, useNavigate } from "react-router-dom";
import { Button, Input } from "../components/ui";

type FormValues = {
  name: string;
  email: string;
  password: string;
  repeatPassword: string;
};

function getEmailRedirectTo() {
  return `${window.location.origin}/login`;
}

async function savePendingProfile(userId: string, name: string, email: string) {
  await supabase.from("profiles").upsert({
    user_id: userId,
    name,
    email,
    status: "pending",
  }, {
    onConflict: "user_id",
    ignoreDuplicates: true,
  });
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
        emailRedirectTo: getEmailRedirectTo(),
        data: {
          name,
        },
      },
    });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (data.user && data.session) {
      await savePendingProfile(data.user.id, name, email);
      navigate("/pending");
      return;
    }

    navigate("/login", {
      replace: true,
      state: {
        notice: "Registration successful. Check your email to confirm your account, then log in.",
      },
    });
  };

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
          <Input
            type="text"
            label="Name"
            error={errors.name?.message}
            {...register("name", { required: "Name is required" })}
            placeholder="Name"
          />

          <Input
            type="email"
            label="Email"
            error={errors.email?.message}
            {...register("email", { required: "Email is required" })}
            placeholder="Email"
          />

          <Input
            type="password"
            label="Password"
            error={errors.password?.message}
            {...register("password", { required: "Password is required" })}
            placeholder="Password"
          />

          <Input
            type="password"
            label="Repeat password"
            error={errors.repeatPassword?.message}
            {...register("repeatPassword", {
              required: "Repeat password is required",
            })}
            placeholder="Repeat password"
          />

          <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
            Register
          </Button>
        </form>
      </section>
    </div>
  );
}


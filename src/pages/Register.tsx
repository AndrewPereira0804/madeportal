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
    <>
      <h1>Register</h1>
      {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}
      <form className="App" onSubmit={handleSubmit(onSubmit)}>
        <input 
          type='text'
          {...register("name", { required: "Name is required" })}
          placeholder="Name"
        />
        {errors.name && (
          <span style={{ color: "red" }}>{errors.name.message}</span>
        )}
        <input
          type="email"
          {...register("email", { required: "Email is required" })}
          placeholder="Email"
        />
        {errors.email && (
          <span style={{ color: "red" }}>{errors.email.message}</span>
        )}

        <input
          type="password"
          {...register("password", { required: "Password is required" })}
          placeholder="Password"
        />
        {errors.password && (
          <span style={{ color: "red" }}>{errors.password.message}</span>
        )}

        <input
          type="password"
          {...register("repeatPassword", {
            required: "Repeat password is required",
          })}
          placeholder="Repeat Password"
        />
        {errors.repeatPassword && (
          <span style={{ color: "red" }}>{errors.repeatPassword.message}</span>
        )}

        <button type="submit" disabled={isSubmitting}>
          Register
        </button>
      </form>
    </>
  );
}


import { Link } from "react-router-dom";
import supabase from "../config/supabaseClient";


export default function Home() {
  console.log(supabase);
  return (
    <>
      <h1>Home</h1>
      <p>
        Try: <Link to="/login">Login</Link> | <Link to="/register">Register</Link>{" "}
        | <Link to="/app">App</Link>
      </p>
    </>
  );
}
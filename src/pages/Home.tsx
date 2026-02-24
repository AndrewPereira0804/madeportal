import { Link } from "react-router-dom";

export default function Home() {
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
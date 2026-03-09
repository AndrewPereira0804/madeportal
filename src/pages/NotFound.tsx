import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="theme-shell">
      <section className="theme-card p-4 p-md-5 text-center">
        <h1 className="page-title">404 - Not Found</h1>
        <p className="page-subtitle mt-3">The page you requested could not be found.</p>
        <Link to="/" className="btn btn-primary mt-4">
          Go Home
        </Link>
      </section>
    </div>
  );
}

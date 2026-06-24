import { Button } from "../components/ui";

export default function NotFound() {
  return (
    <div className="theme-shell">
      <section className="theme-card p-4 p-md-5 text-center">
        <h1 className="page-title">Page not found</h1>
        <p className="page-subtitle mt-3">That Portal route is not available.</p>
        <Button to="/" className="mt-4">
          Go Home
        </Button>
      </section>
    </div>
  );
}

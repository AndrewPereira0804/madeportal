import { Link } from "react-router-dom";

export default function CreateEvent() {
  return (
    <section className="theme-card p-4 p-md-5 mt-4">
      <h1 className="page-title">Manage Events</h1>
      <p className="page-subtitle mt-2">
        Event creation and calendar management now live in the Scheduling page so CRUD-enabled officers can manage their own events.
      </p>
      <Link to="/app/scheduling" className="btn btn-primary mt-3">
        Open Scheduling
      </Link>
    </section>
  );
}

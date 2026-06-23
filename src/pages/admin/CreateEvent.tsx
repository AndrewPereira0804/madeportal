import { Button, PageHeader } from "../../components/ui";

export default function CreateEvent() {
  return (
    <section className="admin-placeholder">
      <PageHeader
        title="Manage Events"
        subtitle="Event creation and calendar management now live in the Calendar page so CRUD-enabled officers can manage their own events."
        actions={<Button to="/app/scheduling">Open Calendar</Button>}
      />
    </section>
  );
}

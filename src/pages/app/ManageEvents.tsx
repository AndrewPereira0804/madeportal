import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import supabase from "../../config/supabaseClient";
import { useAuth } from "../../auth/authContext";
import useRoles from "../../auth/useRoles";
import { Badge, Button, Card, EmptyState, Input, PageHeader, SectionHeader, Textarea } from "../../components/ui";

type EventRow = {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  created_by: string;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
};

type EventDraft = {
  title: string;
  description: string;
  start: string;
  end: string;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
};

const fullCrudRoles = ["admin", "ea", "eda"];
const ownCrudRoles = ["membered", "scholarship", "treasurer", "hm", "hsm", "rec", "stew"];

function toLocalInputValue(dateIso: string) {
  const date = new Date(dateIso);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function toUtcIso(localDateTimeValue: string) {
  return new Date(localDateTimeValue).toISOString();
}

function formatEastern(dateIso: string) {
  return new Date(dateIso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function dbError(action: string, message: string) {
  return `Database error while trying to ${action}: ${message}`;
}

export default function ManageEvents() {
  const { session } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft>({
    title: "",
    description: "",
    start: "",
    end: "",
    visible_to_alum: false,
    visible_to_neophyte: false,
  });

  const userId = session?.user?.id ?? null;
  const hasFullCrud = useMemo(() => roles.some((role) => fullCrudRoles.includes(role)), [roles]);
  const hasOwnCrud = useMemo(() => roles.some((role) => ownCrudRoles.includes(role)), [roles]);
  const canManage = hasFullCrud || hasOwnCrud;

  const canEditOrDeleteEvent = (event: EventRow) => {
    if (!userId) return false;
    if (hasFullCrud) return true;
    if (!hasOwnCrud) return false;
    return event.created_by === userId;
  };

  useEffect(() => {
    let ignore = false;

    async function fetchEvents() {
      setLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("events")
        .select("id, created_at, title, description, start, end, created_by, visible_to_alum, visible_to_neophyte")
        .order("start", { ascending: true });

      if (error) {
        if (ignore) return;
        setEvents([]);
        setErrorMessage(dbError("load events", error.message));
      } else {
        if (ignore) return;
        setEvents((data ?? []) as EventRow[]);
      }

      setLoading(false);
    }

    const timeoutId = window.setTimeout(() => {
      if (canManage) {
        void fetchEvents();
      } else if (!rolesLoading) {
        setLoading(false);
      }
    }, 0);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [canManage, rolesLoading]);

  function resetDraft() {
    setEditingId(null);
    setDraft({
      title: "",
      description: "",
      start: "",
      end: "",
      visible_to_alum: false,
      visible_to_neophyte: false,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || !userId) {
      setErrorMessage("You do not have permission to create or update events.");
      return;
    }

    if (!draft.title.trim() || !draft.start || !draft.end) {
      setErrorMessage("Title, start, and end are required.");
      return;
    }

    if (new Date(draft.end) <= new Date(draft.start)) {
      setErrorMessage("End date/time must be after start date/time.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      start: toUtcIso(draft.start),
      end: toUtcIso(draft.end),
      created_by: userId,
      visible_to_alum: draft.visible_to_alum,
      visible_to_neophyte: draft.visible_to_neophyte,
    };

    if (editingId) {
      const existing = events.find((row) => row.id === editingId);
      if (!existing || !canEditOrDeleteEvent(existing)) {
        setErrorMessage("You do not have permission to update this event.");
        setSaving(false);
        return;
      }

      const { data, error } = await supabase
        .from("events")
        .update(payload)
        .eq("id", editingId)
        .select("id, created_at, title, description, start, end, created_by, visible_to_alum, visible_to_neophyte")
        .single();

      if (error) {
        setErrorMessage(dbError("update this event", error.message));
      } else if (data) {
        setEvents((current) => current.map((row) => (row.id === data.id ? (data as EventRow) : row)));
        resetDraft();
      }
    } else {
      const { data, error } = await supabase
        .from("events")
        .insert(payload)
        .select("id, created_at, title, description, start, end, created_by, visible_to_alum, visible_to_neophyte")
        .single();

      if (error) {
        setErrorMessage(dbError("create an event", error.message));
      } else if (data) {
        setEvents((current) => [...current, data as EventRow].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
        resetDraft();
      }
    }

    setSaving(false);
  }

  function beginEdit(event: EventRow) {
    setEditingId(event.id);
    setDraft({
      title: event.title,
      description: event.description ?? "",
      start: toLocalInputValue(event.start),
      end: toLocalInputValue(event.end),
      visible_to_alum: event.visible_to_alum,
      visible_to_neophyte: event.visible_to_neophyte,
    });
  }

  async function deleteEvent(eventId: string) {
    const target = events.find((row) => row.id === eventId);
    if (!target || !canEditOrDeleteEvent(target)) {
      setErrorMessage("You do not have permission to delete this event.");
      return;
    }

    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) {
      setErrorMessage(dbError("delete this event", error.message));
      return;
    }

    setEvents((current) => current.filter((row) => row.id !== eventId));
  }

  if (!rolesLoading && !canManage) {
    return <Navigate to="/app/scheduling" replace />;
  }

  return (
    <Card>
      <PageHeader
        title="Manage Events"
        subtitle="Create, edit, and delete events you are permitted to manage."
        bordered
        actions={<Button to="/app/scheduling" variant="outline-secondary">Back to Calendar</Button>}
      />

      <form className="event-management-form" onSubmit={handleSubmit}>
        <SectionHeader
          size="sm"
          title={editingId ? "Update event" : "Create event"}
          description="Brother visibility is always included. Add additional audiences only when needed."
        />

        <div className="budget-form-grid">
          <Input
            className="budget-form-full"
            label="Event title"
            placeholder="Event title"
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          />
          <Textarea
            className="budget-form-full"
            label="Description"
            placeholder="Description"
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            rows={3}
          />
          <Input
            label="Start"
            type="datetime-local"
            value={draft.start}
            onChange={(event) => setDraft((current) => ({ ...current, start: event.target.value }))}
          />
          <Input
            label="End"
            type="datetime-local"
            value={draft.end}
            onChange={(event) => setDraft((current) => ({ ...current, end: event.target.value }))}
          />
        </div>

        <div className="form-check mt-3">
          <input
            id="manageAlumVisibility"
            className="form-check-input"
            type="checkbox"
            checked={draft.visible_to_alum}
            onChange={(event) => setDraft((current) => ({ ...current, visible_to_alum: event.target.checked }))}
          />
          <label className="form-check-label" htmlFor="manageAlumVisibility">
            Visible to alum
          </label>
        </div>

        <div className="form-check">
          <input
            id="manageNeophyteVisibility"
            className="form-check-input"
            type="checkbox"
            checked={draft.visible_to_neophyte}
            onChange={(event) => setDraft((current) => ({ ...current, visible_to_neophyte: event.target.checked }))}
          />
          <label className="form-check-label" htmlFor="manageNeophyteVisibility">
            Visible to neophyte
          </label>
        </div>

        <div className="d-flex gap-2 mt-3 flex-wrap">
          <Button type="submit" disabled={saving || rolesLoading} loading={saving}>
            {editingId ? "Save changes" : "Create event"}
          </Button>
          {editingId && (
            <Button type="button" variant="outline-secondary" onClick={resetDraft}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      {loading && <p className="announcements-state">Loading events...</p>}
      {errorMessage && <p className="mt-4 text-danger">{errorMessage}</p>}

      {!loading && events.length === 0 && (
        <EmptyState
          title="No events available"
          description="Events you can manage will appear here once they are created."
        />
      )}

      {!loading && events.length > 0 && (
        <div className="mt-4 d-grid gap-3">
          {events.map((event) => (
            <article key={event.id} className="event-detail-card">
              <div className="d-flex justify-content-between gap-2 flex-wrap">
                <h2 className="h5 mb-0">{event.title}</h2>
                {canEditOrDeleteEvent(event) && (
                  <div className="d-flex gap-2">
                    <Button type="button" size="sm" variant="outline-secondary" onClick={() => beginEdit(event)}>
                      Edit
                    </Button>
                    <Button type="button" size="sm" variant="danger" onClick={() => deleteEvent(event.id)}>
                      Delete
                    </Button>
                  </div>
                )}
              </div>

              <p className="mb-1 mt-2">{event.description || "No description provided."}</p>
              <p className="mb-1">
                <strong>Starts:</strong> {formatEastern(event.start)}
              </p>
              <p className="mb-1">
                <strong>Ends:</strong> {formatEastern(event.end)}
              </p>
              <div className="d-flex gap-2 flex-wrap mt-2">
                <Badge variant="info">brother</Badge>
                {event.visible_to_alum && <Badge variant="info">alum</Badge>}
                {event.visible_to_neophyte && <Badge variant="info">neophyte</Badge>}
              </div>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

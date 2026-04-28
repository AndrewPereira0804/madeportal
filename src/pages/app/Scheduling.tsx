import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import supabase from "../../config/supabaseClient";
import { useAuth } from "../../auth/authProvider";
import useRoles from "../../auth/useRoles";

type Semester = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

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
  semester_id: string | null;
};

type EventDraft = {
  title: string;
  description: string;
  start: string;
  end: string;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
  semester_id: string;
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

export default function Scheduling() {
  const { session } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>("all");
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
    semester_id: "",
  });

  const userId = session?.user?.id ?? null;
  const hasFullCrud = useMemo(() => roles.some((role) => fullCrudRoles.includes(role)), [roles]);
  const hasOwnCrud = useMemo(() => roles.some((role) => ownCrudRoles.includes(role)), [roles]);
  const canCreate = hasFullCrud || hasOwnCrud;

  const canViewEvent = (event: EventRow) => {
    if (roles.includes("brother")) return true;
    if (event.visible_to_alum && roles.includes("alum")) return true;
    if (event.visible_to_neophyte && roles.includes("neophyte")) return true;
    return false;
  };

  const canEditOrDeleteEvent = (event: EventRow) => {
    if (!userId) return false;
    if (hasFullCrud) return true;
    if (!hasOwnCrud) return false;
    return event.created_by === userId;
  };

  useEffect(() => {
    async function fetchCalendarData() {
      setLoading(true);
      setErrorMessage(null);

      const [semesterResult, eventResult] = await Promise.all([
        supabase.from("semesters").select("id, name, start_date, end_date, is_active").order("start_date", { ascending: true }),
        supabase.from("events").select(
          "id, created_at, title, description, start, end, created_by, visible_to_alum, visible_to_neophyte, semester_id"
        ).order("start", { ascending: true }),
      ]);

      if (semesterResult.error) {
        setErrorMessage(`Could not load semesters: ${semesterResult.error.message}`);
      } else {
        const nextSemesters = (semesterResult.data ?? []) as Semester[];
        setSemesters(nextSemesters);

        const now = new Date().toISOString().slice(0, 10);
        const active = nextSemesters.find((semester) => {
          if (semester.is_active) return true;
          return semester.start_date <= now && semester.end_date >= now;
        });

        setSelectedSemesterId(active?.id ?? "all");
        setDraft((currentDraft) => ({ ...currentDraft, semester_id: active?.id ?? "" }));
      }

      if (eventResult.error) {
        setEvents([]);
        setErrorMessage(`Could not load events: ${eventResult.error.message}`);
      } else {
        setEvents((eventResult.data ?? []) as EventRow[]);
      }

      setLoading(false);
    }

    fetchCalendarData();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreate || !userId) {
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
      semester_id: draft.semester_id || null,
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
        .select("id, created_at, title, description, start, end, created_by, visible_to_alum, visible_to_neophyte, semester_id")
        .single();

      if (error) {
        setErrorMessage(`Could not update event: ${error.message}`);
      } else if (data) {
        setEvents((current) => current.map((row) => (row.id === data.id ? (data as EventRow) : row)));
        setEditingId(null);
      }
    } else {
      const { data, error } = await supabase
        .from("events")
        .insert(payload)
        .select("id, created_at, title, description, start, end, created_by, visible_to_alum, visible_to_neophyte, semester_id")
        .single();

      if (error) {
        setErrorMessage(`Could not create event: ${error.message}`);
      } else if (data) {
        setEvents((current) => [...current, data as EventRow].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
      }
    }

    setSaving(false);
    setDraft((currentDraft) => ({
      ...currentDraft,
      title: "",
      description: "",
      start: "",
      end: "",
      visible_to_alum: false,
      visible_to_neophyte: false,
    }));
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
      semester_id: event.semester_id ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft((currentDraft) => ({
      ...currentDraft,
      title: "",
      description: "",
      start: "",
      end: "",
      visible_to_alum: false,
      visible_to_neophyte: false,
    }));
  }

  async function deleteEvent(eventId: string) {
    const target = events.find((event) => event.id === eventId);
    if (!target || !canEditOrDeleteEvent(target)) {
      setErrorMessage("You do not have permission to delete this event.");
      return;
    }

    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) {
      setErrorMessage(`Could not delete event: ${error.message}`);
      return;
    }

    setEvents((current) => current.filter((event) => event.id !== eventId));
  }

  const filteredEvents = events
    .filter((event) => canViewEvent(event))
    .filter((event) => {
      if (selectedSemesterId === "all") return true;
      return event.semester_id === selectedSemesterId;
    });

  return (
    <section className="theme-card p-4 p-md-5">
      <h1 className="page-title">Scheduling</h1>
      <p className="page-subtitle mt-2">
        Semester-based chapter calendar. All times are shown in America/New_York.
      </p>

      <div className="mt-4">
        <label className="form-label" htmlFor="semesterFilter">Semester filter</label>
        <select
          id="semesterFilter"
          className="form-select"
          value={selectedSemesterId}
          onChange={(filterEvent) => setSelectedSemesterId(filterEvent.target.value)}
        >
          <option value="all">All semesters and off-term events</option>
          {semesters.map((semester) => (
            <option key={semester.id} value={semester.id}>
              {semester.name} ({semester.start_date} to {semester.end_date})
            </option>
          ))}
        </select>
      </div>

      {canCreate && (
        <form className="mt-4" onSubmit={handleSubmit}>
          <h2 className="h5">{editingId ? "Update event" : "Create event"}</h2>
          <input
            className="form-control mt-2"
            placeholder="Event title"
            value={draft.title}
            onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, title: event.target.value }))}
          />
          <textarea
            className="form-control mt-2"
            placeholder="Description"
            value={draft.description}
            onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, description: event.target.value }))}
            rows={3}
          />
          <div className="row g-2 mt-1">
            <div className="col-md-6">
              <label className="form-label">Start</label>
              <input
                className="form-control"
                type="datetime-local"
                value={draft.start}
                onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, start: event.target.value }))}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">End</label>
              <input
                className="form-control"
                type="datetime-local"
                value={draft.end}
                onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, end: event.target.value }))}
              />
            </div>
          </div>

          <label className="form-label mt-2" htmlFor="semesterAssign">Semester</label>
          <select
            id="semesterAssign"
            className="form-select"
            value={draft.semester_id}
            onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, semester_id: event.target.value }))}
          >
            <option value="">No semester (off-term/general)</option>
            {semesters.map((semester) => (
              <option key={semester.id} value={semester.id}>
                {semester.name}
              </option>
            ))}
          </select>

          <div className="form-check mt-3">
            <input
              id="alumVisibility"
              className="form-check-input"
              type="checkbox"
              checked={draft.visible_to_alum}
              onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, visible_to_alum: event.target.checked }))}
            />
            <label className="form-check-label" htmlFor="alumVisibility">
              Visible to alum
            </label>
          </div>
          <div className="form-check">
            <input
              id="neophyteVisibility"
              className="form-check-input"
              type="checkbox"
              checked={draft.visible_to_neophyte}
              onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, visible_to_neophyte: event.target.checked }))}
            />
            <label className="form-check-label" htmlFor="neophyteVisibility">
              Visible to neophyte
            </label>
          </div>
          <small className="text-body-secondary d-block mt-1">
            Brother visibility is always on.
          </small>

          <div className="d-flex gap-2 mt-3">
            <button type="submit" className="btn btn-primary" disabled={saving || rolesLoading}>
              {editingId ? "Save changes" : "Create event"}
            </button>
            {editingId && (
              <button type="button" className="btn btn-outline-secondary" onClick={cancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {!canCreate && (
        <p className="mt-4 mb-0 text-body-secondary">You can view events but cannot create or edit events.</p>
      )}

      {loading && <p className="mt-4">Loading calendar…</p>}
      {errorMessage && <p className="mt-4 text-danger">{errorMessage}</p>}

      {!loading && filteredEvents.length === 0 && (
        <p className="mt-4">No events match your current visibility and semester filter.</p>
      )}

      {!loading && filteredEvents.length > 0 && (
        <div className="mt-4 d-grid gap-3">
          {filteredEvents.map((event) => (
            <article key={event.id} className="border rounded p-3 bg-light-subtle">
              <div className="d-flex justify-content-between gap-2 flex-wrap">
                <h2 className="h5 mb-0">{event.title}</h2>
                <div className="d-flex gap-2">
                  {canEditOrDeleteEvent(event) && (
                    <>
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => beginEdit(event)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteEvent(event.id)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
              <p className="mb-1 mt-2">{event.description || "No description provided."}</p>
              <p className="mb-1"><strong>Starts:</strong> {formatEastern(event.start)}</p>
              <p className="mb-1"><strong>Ends:</strong> {formatEastern(event.end)}</p>
              <p className="mb-0 text-body-secondary">
                Audience: brother{event.visible_to_alum ? ", alum" : ""}{event.visible_to_neophyte ? ", neophyte" : ""}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

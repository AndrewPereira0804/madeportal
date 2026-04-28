import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import supabase from "../../config/supabaseClient";
import useRoles from "../../auth/useRoles";

type CalendarWindow = {
  id: string;
  label: string;
  start: string;
  end: string;
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
};

const fullCrudRoles = ["admin", "ea", "eda"];
const ownCrudRoles = ["membered", "scholarship", "treasurer", "hm", "hsm", "rec", "stew"];

function formatEastern(dateIso: string) {
  return new Date(dateIso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normalizeCalendarRow(row: Record<string, unknown>): CalendarWindow | null {
  const id = typeof row.id === "string" || typeof row.id === "number" ? String(row.id) : null;
  const start = typeof row.start === "string" ? row.start : null;
  const end = typeof row.end === "string" ? row.end : null;
  const labelCandidate = typeof row.name === "string" ? row.name : typeof row.title === "string" ? row.title : null;

  if (!id || !start || !end || !labelCandidate) {
    return null;
  }

  return {
    id,
    label: labelCandidate,
    start,
    end,
  };
}

function getWindowForEvent(event: EventRow, windows: CalendarWindow[]) {
  const eventStart = new Date(event.start).getTime();
  return windows.find((window) => {
    const start = new Date(window.start).getTime();
    const end = new Date(window.end).getTime();
    return eventStart >= start && eventStart <= end;
  });
}

export default function Scheduling() {
  const { roles, loading: rolesLoading } = useRoles();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [windows, setWindows] = useState<CalendarWindow[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasFullCrud = useMemo(() => roles.some((role) => fullCrudRoles.includes(role)), [roles]);
  const hasOwnCrud = useMemo(() => roles.some((role) => ownCrudRoles.includes(role)), [roles]);
  const canManageEvents = hasFullCrud || hasOwnCrud;

  const canViewEvent = (event: EventRow) => {
    if (roles.includes("brother")) return true;
    if (event.visible_to_alum && roles.includes("alum")) return true;
    if (event.visible_to_neophyte && roles.includes("neophyte")) return true;
    return false;
  };

  useEffect(() => {
    async function fetchCalendarData() {
      setLoading(true);
      setErrorMessage(null);

      const [windowResult, eventResult] = await Promise.all([
        supabase.from("calendars").select("*").order("start", { ascending: true }),
        supabase
          .from("events")
          .select("id, created_at, title, description, start, end, created_by, visible_to_alum, visible_to_neophyte")
          .order("start", { ascending: true }),
      ]);

      if (windowResult.error) {
        setErrorMessage(`Could not load school schedule windows: ${windowResult.error.message}`);
      } else {
        const parsedWindows = (windowResult.data ?? [])
          .map((row) => normalizeCalendarRow(row as Record<string, unknown>))
          .filter((row): row is CalendarWindow => row !== null)
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

        setWindows(parsedWindows);
      }

      if (eventResult.error) {
        setEvents([]);
        setErrorMessage((current) => current ?? `Could not load events: ${eventResult.error.message}`);
      } else {
        setEvents((eventResult.data ?? []) as EventRow[]);
      }

      setLoading(false);
    }

    fetchCalendarData();
  }, []);

  const filteredEvents = events
    .filter((event) => canViewEvent(event))
    .filter((event) => {
      if (selectedWindowId === "all") return true;
      const window = getWindowForEvent(event, windows);
      return window?.id === selectedWindowId;
    });

  return (
    <section className="theme-card p-4 p-md-5">
      <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
        <div>
          <h1 className="page-title">Scheduling</h1>
          <p className="page-subtitle mt-2 mb-0">
            Chapter calendar with school schedule windows. All event times are shown in America/New_York.
          </p>
        </div>

        {!rolesLoading && canManageEvents && (
          <Link to="/app/events/manage" className="btn btn-primary">
            Manage Events
          </Link>
        )}
      </div>

      <div className="mt-4">
        <label className="form-label" htmlFor="windowFilter">
          School schedule filter
        </label>
        <select
          id="windowFilter"
          className="form-select"
          value={selectedWindowId}
          onChange={(event) => setSelectedWindowId(event.target.value)}
        >
          <option value="all">All windows and off-schedule events</option>
          {windows.map((window) => (
            <option key={window.id} value={window.id}>
              {window.label} ({window.start} to {window.end})
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="mt-4">Loading calendar…</p>}
      {errorMessage && <p className="mt-4 text-danger">{errorMessage}</p>}

      {!loading && filteredEvents.length === 0 && <p className="mt-4">No events match your visibility and filter.</p>}

      {!loading && filteredEvents.length > 0 && (
        <div className="mt-4 d-grid gap-3">
          {filteredEvents.map((event) => {
            const window = getWindowForEvent(event, windows);
            return (
              <article key={event.id} className="border rounded p-3 bg-light-subtle">
                <div className="d-flex justify-content-between gap-2 flex-wrap">
                  <h2 className="h5 mb-0">{event.title}</h2>
                </div>
                <p className="mb-1 mt-2">{event.description || "No description provided."}</p>
                <p className="mb-1">
                  <strong>Starts:</strong> {formatEastern(event.start)}
                </p>
                <p className="mb-1">
                  <strong>Ends:</strong> {formatEastern(event.end)}
                </p>
                <p className="mb-1 text-body-secondary">
                  <strong>Schedule window:</strong> {window ? window.label : "Outside configured school windows"}
                </p>
                <p className="mb-0 text-body-secondary">
                  Audience: brother{event.visible_to_alum ? ", alum" : ""}
                  {event.visible_to_neophyte ? ", neophyte" : ""}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

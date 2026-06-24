import { useEffect, useMemo, useState } from "react";
import supabase from "../../config/supabaseClient";
import { useAuth } from "../../auth/authContext";
import { canManageEvents as canManageRoleEvents, canViewEvent } from "../../auth/roleAccess";
import useRoles from "../../auth/useRoles";
import { Badge, Button, Card, EmptyState, PageHeader, SectionHeader, Select } from "../../components/ui";

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

function toWindowTimestamp(value: string, endOfDay: boolean) {
  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyPattern.test(value)) {
    return Date.parse(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  }

  return new Date(value).getTime();
}

function getWindowsForEvent(event: EventRow, windows: CalendarWindow[]) {
  const eventStart = new Date(event.start).getTime();
  const eventEnd = new Date(event.end).getTime();

  return windows.filter((window) => {
    const start = toWindowTimestamp(window.start, false);
    const end = toWindowTimestamp(window.end, true);

    return eventStart <= end && eventEnd >= start;
  });
}

function toDayStart(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildMonthGrid(monthDate: Date) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function eventIntersectsDay(event: EventRow, day: Date) {
  const dayStart = toDayStart(day).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;
  const eventStart = new Date(event.start).getTime();
  const eventEnd = new Date(event.end).getTime();

  return eventStart <= dayEnd && eventEnd >= dayStart;
}

function formatMonthHeading(date: Date) {
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function formatEventTime(event: EventRow, day: Date) {
  const dayStart = toDayStart(day).getTime();
  const eventStart = new Date(event.start).getTime();

  if (eventStart < dayStart) {
    return "Continues";
  }

  return new Date(event.start).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toCalendarDate(value: string) {
  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyPattern.test(value)) {
    return new Date(`${value}T00:00:00`);
  }

  return new Date(value);
}

function isDayWithinWindow(day: Date, window: CalendarWindow) {
  const dayStart = toDayStart(day).getTime();
  const start = toDayStart(toCalendarDate(window.start)).getTime();
  const end = toDayStart(toCalendarDate(window.end)).getTime();
  return dayStart >= start && dayStart <= end;
}

export default function Scheduling() {
  const { session } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const userId = session?.user?.id ?? null;
  const [events, setEvents] = useState<EventRow[]>([]);
  const [windows, setWindows] = useState<CalendarWindow[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<string>("all");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(new Date()));
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canManageEvents = useMemo(() => canManageRoleEvents(roles), [roles]);

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
    .filter((event) => canViewEvent(roles, event, userId))
    .filter((event) => {
      if (selectedWindowId === "all") return true;
      const matchingWindows = getWindowsForEvent(event, windows);
      return matchingWindows.some((window) => window.id === selectedWindowId);
    });

  const selectedWindow = useMemo(
    () => windows.find((window) => window.id === selectedWindowId) ?? null,
    [windows, selectedWindowId]
  );

  const selectedWindowStartMonth = useMemo(() => {
    if (!selectedWindow) return null;
    const start = toDayStart(toCalendarDate(selectedWindow.start));
    return new Date(start.getFullYear(), start.getMonth(), 1);
  }, [selectedWindow]);

  const selectedWindowEndMonth = useMemo(() => {
    if (!selectedWindow) return null;
    const end = toDayStart(toCalendarDate(selectedWindow.end));
    return new Date(end.getFullYear(), end.getMonth(), 1);
  }, [selectedWindow]);

  const monthGridDays = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);

  const canGoPrev = useMemo(() => {
    if (!selectedWindowStartMonth) return true;
    return currentMonth.getTime() > selectedWindowStartMonth.getTime();
  }, [currentMonth, selectedWindowStartMonth]);

  const canGoNext = useMemo(() => {
    if (!selectedWindowEndMonth) return true;
    return currentMonth.getTime() < selectedWindowEndMonth.getTime();
  }, [currentMonth, selectedWindowEndMonth]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventRow[]>();

    for (const day of monthGridDays) {
      const key = toDateKey(day);
      const dayEvents = filteredEvents
        .filter((event) => eventIntersectsDay(event, day))
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      map.set(key, dayEvents);
    }

    return map;
  }, [filteredEvents, monthGridDays]);

  const selectedDayEvents = eventsByDay.get(selectedDateKey) ?? [];

  return (
    <Card>
      <PageHeader
        title="Scheduling"
        subtitle="Chapter calendar with school schedule windows. All event times are shown in America/New_York."
        bordered
        actions={
          !rolesLoading && canManageEvents ? (
            <Button to="/app/events/manage">Manage Events</Button>
          ) : undefined
        }
      />

      <div className="mt-4">
        <Select
          id="windowFilter"
          label="School schedule filter"
          value={selectedWindowId}
          onChange={(event) => {
            const nextId = event.target.value;
            setSelectedWindowId(nextId);

            if (nextId === "all") {
              return;
            }

            const nextWindow = windows.find((window) => window.id === nextId);
            if (!nextWindow) {
              return;
            }

            const firstDay = toDayStart(toCalendarDate(nextWindow.start));
            setCurrentMonth(new Date(firstDay.getFullYear(), firstDay.getMonth(), 1));
            setSelectedDateKey(toDateKey(firstDay));
          }}
        >
          <option value="all">All windows and off-schedule events</option>
          {windows.map((window) => (
            <option key={window.id} value={window.id}>
              {window.label} ({window.start} to {window.end})
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-4 d-flex flex-wrap gap-2 align-items-end justify-content-between">
        <SectionHeader
          className="mt-0"
          title="Calendar month"
          description={`Showing ${filteredEvents.length} event${filteredEvents.length === 1 ? "" : "s"} in this filter.`}
        />
        <div className="d-flex gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline-secondary"
            size="sm"
            disabled={!canGoPrev}
            onClick={() => setCurrentMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
          >
            Previous
          </Button>
          {!selectedWindow && (
            <Button
              type="button"
              variant="outline-secondary"
              size="sm"
              onClick={() => {
                const today = new Date();
                setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                setSelectedDateKey(toDateKey(today));
              }}
            >
              Today
            </Button>
          )}
          <Button
            type="button"
            variant="outline-secondary"
            size="sm"
            disabled={!canGoNext}
            onClick={() => setCurrentMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
          >
            Next
          </Button>
        </div>
      </div>

      {loading && <p className="announcements-state">Loading calendar...</p>}
      {errorMessage && <p className="mt-4 text-danger">{errorMessage}</p>}

      {!loading && filteredEvents.length === 0 && (
        <EmptyState
          title="No events in this view"
          description="No events match your current visibility and schedule filter."
        />
      )}

      {!loading && filteredEvents.length > 0 && (
        <>
          <div className="mt-4">
            <h3 className="h4 mb-3">
              {selectedWindow
                ? `${selectedWindow.label} (${selectedWindow.start} to ${selectedWindow.end})`
                : formatMonthHeading(currentMonth)}
            </h3>
            <div className="calendar-grid-labels">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                <div key={label} className="calendar-grid-label">
                  {label}
                </div>
              ))}
            </div>
            <div className="calendar-grid">
              {monthGridDays.map((day) => {
                const key = toDateKey(day);
                const dayEvents = eventsByDay.get(key) ?? [];
                const inMonth = day.getMonth() === currentMonth.getMonth();
                const inWindowRange = selectedWindow ? isDayWithinWindow(day, selectedWindow) : true;
                const isSelected = key === selectedDateKey;

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!inWindowRange}
                    className={`calendar-day ${inMonth && inWindowRange ? "" : "is-muted"} ${isSelected ? "is-selected" : ""}`}
                    onClick={() => {
                      if (!inWindowRange) return;
                      setSelectedDateKey(key);
                    }}
                  >
                    <span className="calendar-day-number">{day.getDate()}</span>
                    <div className="calendar-day-events">
                      {dayEvents.slice(0, 2).map((event) => (
                        <div key={`${key}-${event.id}`} className="calendar-event-chip" title={event.title}>
                          <strong>{formatEventTime(event, day)}</strong> {event.title}
                        </div>
                      ))}
                      {dayEvents.length > 2 && <div className="calendar-event-more">+{dayEvents.length - 2} more</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 d-grid gap-3">
            <SectionHeader className="mt-0" size="sm" title="Selected day details" />
            {selectedDayEvents.length === 0 && (
              <EmptyState
                compact
                title="No events on this day"
                description="There are no visible events for the selected day and filter."
              />
            )}
            {selectedDayEvents.map((event) => {
              const matchingWindows = getWindowsForEvent(event, windows);
              return (
                <article key={event.id} className="event-detail-card">
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
                    <strong>Schedule windows:</strong>{" "}
                    {matchingWindows.length > 0
                      ? matchingWindows.map((window) => window.label).join(", ")
                      : "Outside configured school windows"}
                  </p>
                  <div className="d-flex gap-2 flex-wrap mt-2">
                    <Badge variant="info">brother</Badge>
                    {event.visible_to_alum && <Badge variant="info">alum</Badge>}
                    {event.visible_to_neophyte && <Badge variant="info">neophyte</Badge>}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

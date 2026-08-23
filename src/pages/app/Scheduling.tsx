import { useEffect, useMemo, useState } from "react";
import supabase from "../../config/supabaseClient";
import { canManageEvents as canManageRoleEvents, canViewEvent } from "../../auth/roleAccess";
import useRoles from "../../auth/useRoles";
import EventTagBadges from "../../components/events/EventTagBadges";
import { Button, Card, EmptyState, PageHeader, SectionHeader, Select } from "../../components/ui";
import { normalizeAlumniEventDetails } from "../../lib/alumniEvents";
import { normalizeCommunityServiceEventDetails } from "../../lib/communityServiceEvents";
import { compareEventDateTimes, formatEventDateTime, getEventDateTimeMs } from "../../lib/eventDateTime";
import {
  eventTypeOptions,
  eventHasTag,
  getEventTypeClassName,
  getEventTagsLabel,
  type EventTypeSlug,
} from "../../lib/eventTypes";
import { normalizeFormalEventDetails } from "../../lib/formalEvents";
import { normalizePartyEventDetails } from "../../lib/partyEvents";
import { normalizeProfessionalDevelopmentEventDetails } from "../../lib/professionalDevelopmentEvents";

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
  event_type: EventTypeSlug | null;
  event_tags: EventTypeSlug[] | null;
  details: unknown;
  start: string;
  end: string;
  created_by: string;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
};

type CalendarDisplayMode = "agenda" | "calendar";
type EventTypeFilter = "all" | EventTypeSlug;

type AgendaGroup = {
  key: string;
  title: string;
  emptyMessage: string;
  events: EventRow[];
};

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
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    ).getTime();
  }

  return getEventDateTimeMs(value);
}

function getWindowsForEvent(event: EventRow, windows: CalendarWindow[]) {
  const eventStart = getEventDateTimeMs(event.start);
  const eventEnd = getEventDateTimeMs(event.end);

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

function toDayEnd(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
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
  return eventIntersectsRange(event, dayStart, dayEnd);
}

function eventIntersectsRange(event: EventRow, rangeStart: number, rangeEnd: number) {
  const eventStart = getEventDateTimeMs(event.start);
  const eventEnd = getEventDateTimeMs(event.end);

  return eventStart <= rangeEnd && eventEnd >= rangeStart;
}

function formatMonthHeading(date: Date) {
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function formatDayHeading(dateKey: string) {
  return toCalendarDate(dateKey).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatEventTime(event: EventRow, day: Date) {
  const dayStart = toDayStart(day).getTime();
  const eventStart = getEventDateTimeMs(event.start);

  if (eventStart < dayStart) {
    return "Continues";
  }

  return formatEventDateTime(event.start, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getEventDescription(event: EventRow) {
  const description = event.description?.trim();
  return description ? description : null;
}

function isSameEventDay(event: EventRow) {
  const startMs = getEventDateTimeMs(event.start);
  const endMs = getEventDateTimeMs(event.end);

  return startMs > 0 && endMs > 0 && toDateKey(new Date(startMs)) === toDateKey(new Date(endMs));
}

function formatAgendaDate(event: EventRow, options: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "long",
  day: "numeric",
}) {
  return formatEventDateTime(event.start, options);
}

function formatAgendaTimeRange(event: EventRow) {
  if (isSameEventDay(event)) {
    return `${formatEventDateTime(event.start, {
      hour: "numeric",
      minute: "2-digit",
    })} to ${formatEventDateTime(event.end, {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }

  return `${formatEventDateTime(event.start)} to ${formatEventDateTime(event.end)}`;
}

function getUpcomingEvents(events: EventRow[], now: Date) {
  const nowMs = now.getTime();

  return events
    .filter((event) => getEventDateTimeMs(event.end) >= nowMs)
    .sort((a, b) => compareEventDateTimes(a.start, b.start));
}

function getAgendaGroups(events: EventRow[], now: Date): AgendaGroup[] {
  const nowMs = now.getTime();
  const todayStart = toDayStart(now);
  const todayEnd = toDayEnd(now);
  const tomorrowStart = addDays(todayStart, 1);
  const weekEnd = toDayEnd(addDays(todayStart, 6 - todayStart.getDay()));
  const todayEvents: EventRow[] = [];
  const weekEvents: EventRow[] = [];
  const upcomingEvents: EventRow[] = [];

  for (const event of events) {
    if (eventIntersectsRange(event, nowMs, todayEnd.getTime())) {
      todayEvents.push(event);
    } else if (
      tomorrowStart.getTime() <= weekEnd.getTime() &&
      eventIntersectsRange(event, tomorrowStart.getTime(), weekEnd.getTime())
    ) {
      weekEvents.push(event);
    } else {
      upcomingEvents.push(event);
    }
  }

  return [
    {
      key: "today",
      title: "Today",
      emptyMessage: "No more visible events today.",
      events: todayEvents,
    },
    {
      key: "this-week",
      title: "This week",
      emptyMessage: "No visible events later this week.",
      events: weekEvents,
    },
    {
      key: "upcoming",
      title: "Upcoming",
      emptyMessage: "No later visible events.",
      events: upcomingEvents,
    },
  ];
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

function getAudienceLabels(event: EventRow) {
  const labels = ["Brothers"];

  if (eventHasTag(event.event_tags, "alumni_event", event.event_type) || event.visible_to_alum) {
    labels.push("Alumni");
  }

  if (event.visible_to_neophyte) {
    labels.push("Neophytes");
  }

  return labels;
}

function EventAudienceMeta({ event }: { event: EventRow }) {
  return <span className="event-audience-meta">Audience: {getAudienceLabels(event).join(", ")}</span>;
}

function EventWindowMeta({ windows }: { windows: CalendarWindow[] }) {
  if (windows.length === 0) {
    return (
      <span className="event-window-meta" title="Outside configured school windows">
        Off-window
      </span>
    );
  }

  return <span className="event-window-meta">{windows.map((window) => window.label).join(", ")}</span>;
}

function EventTypePublicDetails({ event }: { event: EventRow }) {
  if (event.event_type === "party") {
    const details = normalizePartyEventDetails(event.details);

    return (
      <div className="event-public-details">
        <p>
          <strong>Theme:</strong> {details.theme || "Not set"}
        </p>
        <p>
          <strong>Invite list:</strong>{" "}
          {details.inviteListUrl ? (
            <a href={details.inviteListUrl} target="_blank" rel="noreferrer">
              Google Sheets
            </a>
          ) : (
            "Not set"
          )}
        </p>
      </div>
    );
  }

  if (event.event_type === "formal") {
    const details = normalizeFormalEventDetails(event.details);

    return (
      <div className="event-public-details">
        <p>
          <strong>Theme:</strong> {details.theme || "Not set"}
        </p>
      </div>
    );
  }

  if (event.event_type === "community_service") {
    const details = normalizeCommunityServiceEventDetails(event.details);

    return (
      <div className="event-public-details">
        <p>
          <strong>Organization:</strong> {details.organization || "Not set"}
        </p>
        <p>
          <strong>Location:</strong> {details.location || "Not set"}
        </p>
      </div>
    );
  }

  if (event.event_type === "professional_development") {
    const details = normalizeProfessionalDevelopmentEventDetails(event.details);

    if (!details.speaker) {
      return null;
    }

    return (
      <div className="event-public-details">
        <p>
          <strong>Speaker:</strong> {details.speaker}
        </p>
      </div>
    );
  }

  if (event.event_type === "alumni_event") {
    const details = normalizeAlumniEventDetails(event.details);

    return (
      <div className="event-public-details">
        <p>
          <strong>Location:</strong> {details.location || "Not set"}
        </p>
      </div>
    );
  }

  return null;
}

function AgendaEventCard({
  event,
  windows,
  isExpanded,
  onToggle,
  detailIdPrefix,
  variant = "standard",
}: {
  event: EventRow;
  windows: CalendarWindow[];
  isExpanded: boolean;
  onToggle: (eventId: string) => void;
  detailIdPrefix: string;
  variant?: "standard" | "next-up";
}) {
  const matchingWindows = getWindowsForEvent(event, windows);
  const description = getEventDescription(event);
  const detailsId = `${detailIdPrefix}-${event.id}`;
  const isNextUp = variant === "next-up";

  return (
    <article
      className={`agenda-event-card ${isNextUp ? "agenda-event-card--next-up" : ""} ${isExpanded ? "is-expanded" : ""}`}
    >
      <button
        type="button"
        className="agenda-event-button"
        aria-expanded={isExpanded}
        aria-controls={detailsId}
        onClick={() => onToggle(event.id)}
      >
        <span className="agenda-event-date">
          <span>{formatAgendaDate(event, { weekday: "short" })}</span>
          <strong>{formatAgendaDate(event, { month: "short", day: "numeric" })}</strong>
        </span>
        <span className="agenda-event-body">
          {isNextUp && <span className="agenda-event-kicker">Next Up</span>}
          <span className="agenda-event-heading">
            <span className="agenda-event-title">{event.title}</span>
            <EventTagBadges eventTags={event.event_tags} eventType={event.event_type} />
          </span>
          <span className="agenda-event-date-line">{formatAgendaDate(event)}</span>
          <span className="agenda-event-time">{formatAgendaTimeRange(event)}</span>
          {description && <span className="agenda-event-description">{description}</span>}
          <span className="agenda-event-footer">
            <span className="agenda-event-meta">
              <EventAudienceMeta event={event} />
              <EventWindowMeta windows={matchingWindows} />
            </span>
            <span className="agenda-event-open-label">{isExpanded ? "Hide details" : "View details"}</span>
          </span>
        </span>
      </button>

      {isExpanded && (
        <div id={detailsId} className="agenda-event-expanded">
          {description && <p className="mb-1">{description}</p>}
          <p className="mb-1">
            <strong>Starts:</strong> {formatEventDateTime(event.start)}
          </p>
          <p className="mb-1">
            <strong>Ends:</strong> {formatEventDateTime(event.end)}
          </p>
          <EventTypePublicDetails event={event} />
          <p className="mb-0 text-body-secondary">
            <strong>Schedule windows:</strong>{" "}
            {matchingWindows.length > 0
              ? matchingWindows.map((window) => window.label).join(", ")
              : "Outside configured school windows"}
          </p>
        </div>
      )}
    </article>
  );
}

export default function Scheduling() {
  const { roles, loading: rolesLoading } = useRoles();
  const [agendaNow] = useState(() => new Date());
  const [events, setEvents] = useState<EventRow[]>([]);
  const [windows, setWindows] = useState<CalendarWindow[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<string>("all");
  const [selectedEventType, setSelectedEventType] = useState<EventTypeFilter>("all");
  const [displayMode, setDisplayMode] = useState<CalendarDisplayMode>("agenda");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(() => new Set());
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
          .select("id, created_at, title, description, event_type, event_tags, details, start, end, created_by, visible_to_alum, visible_to_neophyte")
          .order("start", { ascending: true }),
      ]);

      if (windowResult.error) {
        setErrorMessage(`Could not load school schedule windows: ${windowResult.error.message}`);
      } else {
        const parsedWindows = (windowResult.data ?? [])
          .map((row) => normalizeCalendarRow(row as Record<string, unknown>))
          .filter((row): row is CalendarWindow => row !== null)
          .sort((a, b) => toWindowTimestamp(a.start, false) - toWindowTimestamp(b.start, false));

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

  const visibleEvents = useMemo(() => {
    return events
      .filter((event) => canViewEvent(roles, event))
      .sort((a, b) => compareEventDateTimes(a.start, b.start));
  }, [events, roles]);

  const filteredEvents = useMemo(() => {
    return visibleEvents
      .filter((event) => {
        if (selectedWindowId === "all") return true;
        const matchingWindows = getWindowsForEvent(event, windows);
        return matchingWindows.some((window) => window.id === selectedWindowId);
      })
      .filter((event) => selectedEventType === "all" || eventHasTag(event.event_tags, selectedEventType, event.event_type))
      .sort((a, b) => compareEventDateTimes(a.start, b.start));
  }, [selectedEventType, selectedWindowId, visibleEvents, windows]);

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
        .sort((a, b) => compareEventDateTimes(a.start, b.start));
      map.set(key, dayEvents);
    }

    return map;
  }, [filteredEvents, monthGridDays]);

  const selectedDayEvents = selectedDateKey ? eventsByDay.get(selectedDateKey) ?? [] : [];
  const selectedDayDetailsDescription =
    selectedDateKey && selectedDayEvents.length > 0
      ? `${formatDayHeading(selectedDateKey)} - ${selectedDayEvents.length} event${selectedDayEvents.length === 1 ? "" : "s"}`
      : null;

  const upcomingAgendaEvents = useMemo(() => getUpcomingEvents(filteredEvents, agendaNow), [agendaNow, filteredEvents]);
  const agendaGroups = useMemo(() => getAgendaGroups(upcomingAgendaEvents, agendaNow), [agendaNow, upcomingAgendaEvents]);
  const agendaEventCount = upcomingAgendaEvents.length;
  const nextUpEvent = upcomingAgendaEvents[0] ?? null;

  function toggleEventExpanded(eventId: string) {
    setExpandedEventIds((current) => {
      const next = new Set(current);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }

      return next;
    });
  }

  return (
    <Card>
      <PageHeader
        title="Scheduling"
        subtitle="Official chapter schedule with school schedule windows. All event times are shown in America/New_York."
        bordered
        actions={
          !rolesLoading && canManageEvents ? (
            <Button to="/app/events/manage">Manage Events</Button>
          ) : undefined
        }
      />

      <div className="schedule-control-bar">
        <div className="schedule-filter-row">
          <Select
            id="windowFilter"
            className="schedule-filter-field"
            label="Schedule"
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

          <Select
            id="eventTypeFilter"
            className="schedule-filter-field"
            label="Event type"
            value={selectedEventType}
            onChange={(event) => setSelectedEventType(event.target.value as EventTypeFilter)}
          >
            <option value="all">All event types</option>
            {eventTypeOptions.map((eventType) => (
              <option key={eventType.slug} value={eventType.slug}>
                {eventType.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="schedule-view-actions">
          {displayMode === "agenda" ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              className="schedule-view-toggle"
              onClick={() => setDisplayMode("calendar")}
            >
              Month View
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="md"
              className="schedule-view-toggle"
              onClick={() => setDisplayMode("agenda")}
            >
              Agenda
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 d-flex flex-wrap gap-2 align-items-end justify-content-between">
        <SectionHeader
          className="mt-0"
          title={displayMode === "agenda" ? "Agenda" : "Month View"}
          description={
            displayMode === "agenda"
              ? `Showing ${agendaEventCount} upcoming event${agendaEventCount === 1 ? "" : "s"} in these filters.`
              : `Showing ${filteredEvents.length} event${filteredEvents.length === 1 ? "" : "s"} in these filters.`
          }
        />
        <div className="d-flex gap-2 flex-wrap">
          {displayMode === "calendar" ? (
            <>
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
            </>
          ) : null}
        </div>
      </div>

      {loading && <p className="announcements-state">Loading calendar...</p>}
      {errorMessage && <p className="mt-4 text-danger">{errorMessage}</p>}

      {!loading && displayMode === "calendar" && filteredEvents.length === 0 && (
        <EmptyState
          title="No events in this view"
          description="No events match your current visibility and schedule filter."
        />
      )}

      {!loading && displayMode === "agenda" && (
        <>
          <section className="next-up-section" aria-label="Next Up">
            <SectionHeader
              className="mt-0"
              size="sm"
              title="Next Up"
              description="The next event visible under the current filters."
            />
            {nextUpEvent ? (
              <AgendaEventCard
                event={nextUpEvent}
                windows={windows}
                isExpanded={expandedEventIds.has(nextUpEvent.id)}
                onToggle={toggleEventExpanded}
                detailIdPrefix="next-up-event-details"
                variant="next-up"
              />
            ) : (
              <EmptyState
                compact
                title="No upcoming events match these filters."
                description="Try another schedule window or event type."
              />
            )}
          </section>

          {agendaEventCount > 0 && (
            <div className="agenda-group-list">
              {agendaGroups.map((group) => {
                const groupHeadingId = `agenda-heading-${group.key}`;

                return (
                  <section key={group.key} className="agenda-group" aria-labelledby={groupHeadingId}>
                    <div className="agenda-group-header">
                      <h3 id={groupHeadingId}>{group.title}</h3>
                      <span>
                        {group.events.length} event{group.events.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {group.events.length === 0 ? (
                      <p className="agenda-group-empty">{group.emptyMessage}</p>
                    ) : (
                      <div className="agenda-card-list">
                        {group.events.map((event) => (
                          <AgendaEventCard
                            key={`${group.key}-${event.id}`}
                            event={event}
                            windows={windows}
                            isExpanded={expandedEventIds.has(event.id)}
                            onToggle={toggleEventExpanded}
                            detailIdPrefix={`agenda-${group.key}-event-details`}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {!loading && displayMode === "calendar" && filteredEvents.length > 0 && (
        <>
          {selectedDayDetailsDescription && (
            <section className="month-event-details-section" aria-label="Selected day details">
              <SectionHeader
                className="mt-0"
                size="sm"
                title="Selected day details"
                description={selectedDayDetailsDescription}
              />
              <div className="agenda-card-list">
                {selectedDayEvents.map((event) => (
                  <AgendaEventCard
                    key={event.id}
                    event={event}
                    windows={windows}
                    isExpanded={expandedEventIds.has(event.id)}
                    onToggle={toggleEventExpanded}
                    detailIdPrefix="month-event-details"
                  />
                ))}
              </div>
            </section>
          )}

          <div className="month-calendar-section">
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
                        <div
                          key={`${key}-${event.id}`}
                          className={`calendar-event-chip ${getEventTypeClassName(event.event_type)}`}
                          title={`${getEventTagsLabel(event.event_tags, event.event_type)}: ${event.title}`}
                        >
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
        </>
      )}
    </Card>
  );
}

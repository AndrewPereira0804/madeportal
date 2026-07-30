import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../../auth/authContext";
import { canManageCommunityServiceEvents } from "../../../auth/roleAccess";
import useRoles from "../../../auth/useRoles";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  MetricCard,
  PageHeader,
  SectionHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
} from "../../../components/ui";
import supabase from "../../../config/supabaseClient";
import {
  calculateCommunityServiceTotals,
  createCommunityServiceAttendee,
  createCommunityServiceEventDetails,
  normalizeCommunityServiceEventDetails,
  type CommunityServiceAttendee,
  type CommunityServiceEventDetails,
} from "../../../lib/communityServiceEvents";
import {
  compareEventDateTimes,
  formatEventDateTime,
  isEventEndAfterStart,
  toEventTimestamp,
} from "../../../lib/eventDateTime";
import { getEventTypeClassName, getEventTypeLabel } from "../../../lib/eventTypes";

type CommunityServiceEventRow = {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  event_type: "community_service";
  start: string;
  end: string;
  created_by: string;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
  details: unknown;
};

type CommunityServiceDraft = {
  name: string;
  description: string;
  organization: string;
  location: string;
  start: string;
  end: string;
};

type AttendeeDraft = {
  brotherName: string;
  hours: string;
};

type CommunityServiceEventsToolProps = {
  ownerLabel?: string;
  returnPath?: string;
};

const communityServiceEventSelect =
  "id, created_at, title, description, event_type, start, end, created_by, visible_to_alum, visible_to_neophyte, details";

const emptyDraft: CommunityServiceDraft = {
  name: "",
  description: "",
  organization: "",
  location: "",
  start: "",
  end: "",
};

const emptyAttendeeDraft: AttendeeDraft = {
  brotherName: "",
  hours: "",
};

function formatHours(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function parseHours(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function dbError(action: string, message: string) {
  return `Database error while trying to ${action}: ${message}`;
}

function CommunityServiceAttendeeTable({
  attendees,
  saving,
  onToggleHoursLogged,
  onRemove,
}: {
  attendees: CommunityServiceAttendee[];
  saving: boolean;
  onToggleHoursLogged: (attendeeId: string) => void;
  onRemove: (attendeeId: string) => void;
}) {
  if (attendees.length === 0) {
    return (
      <EmptyState
        compact
        title="No brothers added"
        description="Add attended brothers and their awarded service hours."
      />
    );
  }

  return (
    <Table minWidth={760} className="service-attendee-table">
      <TableHead>
        <TableRow>
          <TableHeaderCell>Brother</TableHeaderCell>
          <TableHeaderCell>Hours</TableHeaderCell>
          <TableHeaderCell>Hours logged with Nationals</TableHeaderCell>
          <TableHeaderCell>Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {attendees.map((attendee) => (
          <TableRow key={attendee.id}>
            <TableCell>{attendee.brotherName}</TableCell>
            <TableCell>{formatHours(attendee.hours)}</TableCell>
            <TableCell>
              <label className="service-logged-toggle">
                <input
                  type="checkbox"
                  checked={attendee.hoursLoggedWithNationals}
                  disabled={saving}
                  onChange={() => onToggleHoursLogged(attendee.id)}
                />
                <span>{attendee.hoursLoggedWithNationals ? "Logged" : "Not logged"}</span>
              </label>
            </TableCell>
            <TableCell>
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => onRemove(attendee.id)}>
                Remove
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function CommunityServiceEventsTool({
  ownerLabel = "Community Service Chairman",
  returnPath = "/app/tools/cs-chair",
}: CommunityServiceEventsToolProps = {}) {
  const { session } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const canManage = useMemo(() => canManageCommunityServiceEvents(roles), [roles]);
  const userId = session?.user?.id ?? null;

  const [events, setEvents] = useState<CommunityServiceEventRow[]>([]);
  const [draft, setDraft] = useState<CommunityServiceDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attendeeInputs, setAttendeeInputs] = useState<Record<string, AttendeeDraft>>({});

  useEffect(() => {
    let ignore = false;

    async function loadCommunityServiceEvents() {
      setLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("events")
        .select(communityServiceEventSelect)
        .eq("event_type", "community_service")
        .order("start", { ascending: true });

      if (ignore) {
        return;
      }

      if (error) {
        setEvents([]);
        setErrorMessage(dbError("load community service events", error.message));
      } else {
        setEvents((data ?? []) as CommunityServiceEventRow[]);
      }

      setLoading(false);
    }

    if (rolesLoading) {
      return () => {
        ignore = true;
      };
    }

    if (!canManage) {
      return () => {
        ignore = true;
      };
    }

    void loadCommunityServiceEvents();

    return () => {
      ignore = true;
    };
  }, [canManage, rolesLoading]);

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || !userId) {
      setErrorMessage("You do not have permission to create community service events.");
      return;
    }

    const name = draft.name.trim();
    const description = draft.description.trim();
    const organization = draft.organization.trim();
    const location = draft.location.trim();

    if (!name || !description || !organization || !draft.start || !draft.end) {
      setErrorMessage("Name, description, organization, start, and end are required.");
      return;
    }

    if (!isEventEndAfterStart(draft.start, draft.end)) {
      setErrorMessage("End date/time must be after start date/time.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    const details = createCommunityServiceEventDetails(organization, location);
    const { data, error } = await supabase
      .from("events")
      .insert({
        title: name,
        description,
        event_type: "community_service",
        start: toEventTimestamp(draft.start),
        end: toEventTimestamp(draft.end),
        created_by: userId,
        visible_to_alum: false,
        visible_to_neophyte: false,
        details,
      })
      .select(communityServiceEventSelect)
      .single();

    if (error) {
      setErrorMessage(dbError("create this community service event", error.message));
    } else if (data) {
      setEvents((current) =>
        [...current, data as CommunityServiceEventRow].sort(
          (a, b) => compareEventDateTimes(a.start, b.start),
        )
      );
      setDraft(emptyDraft);
    }

    setSaving(false);
  }

  async function updateEventDetails(
    eventId: string,
    updater: (details: CommunityServiceEventDetails) => CommunityServiceEventDetails,
    action: string,
  ) {
    const target = events.find((serviceEvent) => serviceEvent.id === eventId);
    if (!target) {
      setErrorMessage("Could not find that community service event.");
      return;
    }

    setUpdatingEventId(eventId);
    setErrorMessage(null);

    const nextDetails = updater(normalizeCommunityServiceEventDetails(target.details));
    const { data, error } = await supabase
      .from("events")
      .update({ details: nextDetails })
      .eq("id", eventId)
      .select(communityServiceEventSelect)
      .single();

    if (error) {
      setErrorMessage(dbError(action, error.message));
    } else if (data) {
      setEvents((current) =>
        current.map((serviceEvent) => (serviceEvent.id === eventId ? (data as CommunityServiceEventRow) : serviceEvent))
      );
    }

    setUpdatingEventId(null);
  }

  function setAttendeeInput(eventId: string, field: keyof AttendeeDraft, value: string) {
    setAttendeeInputs((current) => ({
      ...current,
      [eventId]: {
        ...(current[eventId] ?? emptyAttendeeDraft),
        [field]: value,
      },
    }));
  }

  async function toggleEventLogged(eventId: string) {
    await updateEventDetails(
      eventId,
      (details) => ({
        ...details,
        eventLoggedWithNationals: !details.eventLoggedWithNationals,
      }),
      "update Nationals event status",
    );
  }

  async function addAttendee(eventId: string) {
    const attendeeDraft = attendeeInputs[eventId] ?? emptyAttendeeDraft;
    const brotherName = attendeeDraft.brotherName.trim();
    const hours = parseHours(attendeeDraft.hours);

    if (!brotherName) {
      setErrorMessage("Brother name is required.");
      return;
    }

    if (hours === null) {
      setErrorMessage("Hours must be greater than zero.");
      return;
    }

    await updateEventDetails(
      eventId,
      (details) => ({
        ...details,
        attendees: [...details.attendees, createCommunityServiceAttendee(brotherName, hours)],
      }),
      "add a brother to the community service list",
    );

    setAttendeeInputs((current) => ({
      ...current,
      [eventId]: emptyAttendeeDraft,
    }));
  }

  async function toggleAttendeeHoursLogged(eventId: string, attendeeId: string) {
    await updateEventDetails(
      eventId,
      (details) => ({
        ...details,
        attendees: details.attendees.map((attendee) =>
          attendee.id === attendeeId
            ? { ...attendee, hoursLoggedWithNationals: !attendee.hoursLoggedWithNationals }
            : attendee
        ),
      }),
      "update brother Nationals hours status",
    );
  }

  async function removeAttendee(eventId: string, attendeeId: string) {
    await updateEventDetails(
      eventId,
      (details) => ({
        ...details,
        attendees: details.attendees.filter((attendee) => attendee.id !== attendeeId),
      }),
      "remove a brother from the community service list",
    );
  }

  if (!rolesLoading && !canManage) {
    return <Navigate to={returnPath} replace />;
  }

  return (
    <Card className="tools-page">
      <PageHeader
        eyebrow={ownerLabel}
        title="Community Service Events"
        subtitle="Create community service events, track awarded hours, and mark Nationals logging status."
        bordered
        actions={<Button to={returnPath} variant="outline-secondary">{ownerLabel} Tools</Button>}
      />

      <form className="party-tool-form" onSubmit={handleCreateEvent}>
        <SectionHeader
          size="sm"
          title="Create community service event"
          description="Community service events publish a calendar entry and keep organization, location, attendance, hours, and Nationals status in this tool."
        />

        <div className="budget-form-grid">
          <Input
            className="budget-form-full"
            label="Event name"
            placeholder="Event name"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
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
            label="Organization supported"
            placeholder="Organization"
            value={draft.organization}
            onChange={(event) => setDraft((current) => ({ ...current, organization: event.target.value }))}
          />
          <Input
            label="Location/address"
            placeholder="Optional address"
            value={draft.location}
            onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))}
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

        <div className="d-flex gap-2 mt-3 flex-wrap">
          <Button type="submit" loading={saving} disabled={saving || rolesLoading}>
            Create event
          </Button>
        </div>
      </form>

      {loading && <p className="announcements-state">Loading community service events...</p>}
      {errorMessage && <p className="mt-4 text-danger">{errorMessage}</p>}

      {!loading && events.length === 0 && (
        <EmptyState
          title="No community service events"
          description="Community service events created from this tool will appear here."
        />
      )}

      {!loading && events.length > 0 && (
        <div className="party-event-list">
          {events.map((serviceEvent) => {
            const details = normalizeCommunityServiceEventDetails(serviceEvent.details);
            const totals = calculateCommunityServiceTotals(details);
            const savingEvent = updatingEventId === serviceEvent.id;
            const attendeeDraft = attendeeInputs[serviceEvent.id] ?? emptyAttendeeDraft;

            return (
              <article key={serviceEvent.id} className="party-event-card service-event-card">
                <div className="party-event-summary">
                  <div>
                    <Badge variant="neutral" className={`event-type-badge ${getEventTypeClassName("community_service")}`}>
                      {getEventTypeLabel("community_service")}
                    </Badge>
                    <h3>{serviceEvent.title}</h3>
                    <p>{formatEventDateTime(serviceEvent.start)} to {formatEventDateTime(serviceEvent.end)}</p>
                  </div>
                  <Button
                    type="button"
                    variant={details.eventLoggedWithNationals ? "outline-secondary" : "outline-gold"}
                    size="sm"
                    disabled={savingEvent}
                    onClick={() => void toggleEventLogged(serviceEvent.id)}
                  >
                    {details.eventLoggedWithNationals ? "Mark event not logged" : "Mark event logged"}
                  </Button>
                </div>

                <div className="service-event-meta">
                  <p>
                    <strong>Description:</strong> {serviceEvent.description}
                  </p>
                  <p>
                    <strong>Organization:</strong> {details.organization || "Not set"}
                  </p>
                  <p>
                    <strong>Location:</strong> {details.location || "Not set"}
                  </p>
                </div>

                <div className="service-metric-grid">
                  <MetricCard
                    label="Brothers"
                    value={totals.attendeeCount}
                    detail="attendance rows"
                    tone="info"
                  />
                  <MetricCard
                    label="Total hours"
                    value={formatHours(totals.totalHours)}
                    detail="awarded service hours"
                    tone="gold"
                  />
                  <MetricCard
                    label="Hours logged"
                    value={`${totals.hoursLoggedCount}/${totals.attendeeCount}`}
                    detail="brothers logged with Nationals"
                    tone={totals.pendingHoursCount > 0 ? "warning" : "success"}
                  />
                  <MetricCard
                    label="Event status"
                    value={details.eventLoggedWithNationals ? "Logged" : "Pending"}
                    detail="Nationals event record"
                    tone={details.eventLoggedWithNationals ? "success" : "warning"}
                  />
                </div>

                <section className="service-attendee-panel">
                  <SectionHeader
                    className="mt-0"
                    size="sm"
                    title="Attendance and hours"
                    description="Track each brother who attended, their awarded hours, and whether those hours were logged with Nationals."
                  />

                  <CommunityServiceAttendeeTable
                    attendees={details.attendees}
                    saving={savingEvent}
                    onToggleHoursLogged={(attendeeId) => void toggleAttendeeHoursLogged(serviceEvent.id, attendeeId)}
                    onRemove={(attendeeId) => void removeAttendee(serviceEvent.id, attendeeId)}
                  />

                  <form
                    className="service-attendee-add"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void addAttendee(serviceEvent.id);
                    }}
                  >
                    <Input
                      label="Brother"
                      placeholder="Brother name"
                      value={attendeeDraft.brotherName}
                      onChange={(event) => setAttendeeInput(serviceEvent.id, "brotherName", event.target.value)}
                    />
                    <Input
                      label="Hours"
                      type="number"
                      min="0"
                      step="0.25"
                      inputMode="decimal"
                      placeholder="0"
                      value={attendeeDraft.hours}
                      onChange={(event) => setAttendeeInput(serviceEvent.id, "hours", event.target.value)}
                    />
                    <Button type="submit" variant="outline-secondary" disabled={savingEvent}>
                      Add brother
                    </Button>
                  </form>
                </section>
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}

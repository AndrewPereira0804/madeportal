import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../../auth/authContext";
import { canManageAlumniEvents } from "../../../auth/roleAccess";
import useRoles from "../../../auth/useRoles";
import EventTagBadges from "../../../components/events/EventTagBadges";
import {
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  SectionHeader,
  Textarea,
} from "../../../components/ui";
import supabase from "../../../config/supabaseClient";
import {
  createAlumniEventDetails,
  mergeAlumniEventLocation,
  normalizeAlumniEventDetails,
  type AlumniEventDetails,
} from "../../../lib/alumniEvents";
import {
  compareEventDateTimes,
  formatEventDateTime,
  isEventEndAfterStart,
  toEventTimestamp,
} from "../../../lib/eventDateTime";

type AlumniEventRow = {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  event_type: "alumni_event";
  start: string;
  end: string;
  created_by: string;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
  event_tags: string[] | null;
  details: unknown;
};

type AlumniEventDraft = {
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  visible_to_neophyte: boolean;
};

type AlumniEventsToolProps = {
  ownerLabel: string;
  returnPath: string;
};

const alumniEventSelect =
  "id, created_at, title, description, event_type, event_tags, start, end, created_by, visible_to_alum, visible_to_neophyte, details";

const emptyDraft: AlumniEventDraft = {
  title: "",
  description: "",
  location: "",
  start: "",
  end: "",
  visible_to_neophyte: false,
};

function dbError(action: string, message: string) {
  return `Database error while trying to ${action}: ${message}`;
}

function getLocationInputValue(
  locationInputs: Record<string, string>,
  eventId: string,
  details: AlumniEventDetails,
) {
  return locationInputs[eventId] ?? details.location;
}

export default function AlumniEventsTool({ ownerLabel, returnPath }: AlumniEventsToolProps) {
  const { session } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const canManage = useMemo(() => canManageAlumniEvents(roles), [roles]);
  const userId = session?.user?.id ?? null;

  const [events, setEvents] = useState<AlumniEventRow[]>([]);
  const [draft, setDraft] = useState<AlumniEventDraft>(emptyDraft);
  const [locationInputs, setLocationInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadAlumniEvents() {
      setLoading(true);
      setErrorMessage(null);
      setNoticeMessage(null);

      const { data, error } = await supabase
        .from("events")
        .select(alumniEventSelect)
        .eq("event_type", "alumni_event")
        .order("start", { ascending: true });

      if (ignore) {
        return;
      }

      if (error) {
        setEvents([]);
        setErrorMessage(dbError("load alumni events", error.message));
      } else {
        setEvents((data ?? []) as AlumniEventRow[]);
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

    void loadAlumniEvents();

    return () => {
      ignore = true;
    };
  }, [canManage, rolesLoading]);

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || !userId) {
      setErrorMessage("You do not have permission to create alumni events.");
      return;
    }

    const title = draft.title.trim();
    const description = draft.description.trim();
    const location = draft.location.trim();

    if (!title || !location || !draft.start || !draft.end) {
      setErrorMessage("Title, location, start, and end are required.");
      return;
    }

    if (!isEventEndAfterStart(draft.start, draft.end)) {
      setErrorMessage("End date/time must be after start date/time.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    const { data, error } = await supabase
      .from("events")
      .insert({
        title,
        description: description || null,
        event_type: "alumni_event",
        event_tags: ["alumni_event"],
        start: toEventTimestamp(draft.start),
        end: toEventTimestamp(draft.end),
        created_by: userId,
        visible_to_alum: true,
        visible_to_neophyte: draft.visible_to_neophyte,
        details: createAlumniEventDetails(location),
      })
      .select(alumniEventSelect)
      .single();

    if (error) {
      setErrorMessage(dbError("create this alumni event", error.message));
    } else if (data) {
      setEvents((current) =>
        [...current, data as AlumniEventRow].sort((a, b) => compareEventDateTimes(a.start, b.start))
      );
      setDraft(emptyDraft);
      setNoticeMessage("Alumni event created.");
    }

    setSaving(false);
  }

  async function saveLocation(eventId: string, currentDetails: AlumniEventDetails) {
    const target = events.find((alumniEvent) => alumniEvent.id === eventId);
    if (!target) {
      setErrorMessage("Could not find that alumni event.");
      return;
    }

    const location = getLocationInputValue(locationInputs, eventId, currentDetails).trim();
    if (!location) {
      setErrorMessage("Location is required.");
      return;
    }

    setUpdatingEventId(eventId);
    setErrorMessage(null);
    setNoticeMessage(null);

    const { data, error } = await supabase
      .from("events")
      .update({
        visible_to_alum: true,
        details: mergeAlumniEventLocation(target.details, location),
      })
      .eq("id", eventId)
      .select(alumniEventSelect)
      .single();

    if (error) {
      setErrorMessage(dbError("update the location", error.message));
    } else if (data) {
      setEvents((current) =>
        current.map((alumniEvent) => (alumniEvent.id === eventId ? (data as AlumniEventRow) : alumniEvent))
      );
      setLocationInputs((current) => {
        const next = { ...current };
        delete next[eventId];
        return next;
      });
      setNoticeMessage("Location updated.");
    }

    setUpdatingEventId(null);
  }

  if (!rolesLoading && !canManage) {
    return <Navigate to="/app/tools" replace />;
  }

  return (
    <Card className="tools-page">
      <PageHeader
        eyebrow={ownerLabel}
        title="Alumni Events"
        subtitle="Create alumni events with a public location. Alumni visibility is always included."
        bordered
        actions={<Button to={returnPath} variant="outline-secondary">Alumni Chairman Tools</Button>}
      />

      <form className="party-tool-form" onSubmit={handleCreateEvent}>
        <SectionHeader
          size="sm"
          title="Create alumni event"
          description="Alumni events are always visible to accounts with the Alumni role."
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
            className="budget-form-full"
            label="Location"
            placeholder="Location"
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

        <div className="form-check mt-3">
          <input
            id="alumniEventNeophyteVisibility"
            className="form-check-input"
            type="checkbox"
            checked={draft.visible_to_neophyte}
            onChange={(event) => setDraft((current) => ({ ...current, visible_to_neophyte: event.target.checked }))}
          />
          <label className="form-check-label" htmlFor="alumniEventNeophyteVisibility">
            Visible to neophyte
          </label>
        </div>

        <div className="d-flex gap-2 mt-3 flex-wrap">
          <Button type="submit" loading={saving} disabled={saving || rolesLoading}>
            Create event
          </Button>
        </div>
      </form>

      {loading && <p className="announcements-state">Loading alumni events...</p>}
      {errorMessage && <div className="alert alert-danger mt-3 mb-0">{errorMessage}</div>}
      {noticeMessage && <div className="alert alert-success mt-3 mb-0">{noticeMessage}</div>}

      {!loading && events.length === 0 && (
        <EmptyState
          title="No alumni events"
          description="Alumni events created from this tool will appear here."
        />
      )}

      {!loading && events.length > 0 && (
        <div className="party-event-list">
          {events.map((alumniEvent) => {
            const details = normalizeAlumniEventDetails(alumniEvent.details);
            const locationInputValue = getLocationInputValue(locationInputs, alumniEvent.id, details);
            const savingEvent = updatingEventId === alumniEvent.id;

            return (
              <article key={alumniEvent.id} className="party-event-card service-event-card">
                <div className="party-event-summary">
                  <div>
                    <EventTagBadges eventTags={alumniEvent.event_tags} eventType="alumni_event" />
                    <h3>{alumniEvent.title}</h3>
                    <p>{formatEventDateTime(alumniEvent.start)} to {formatEventDateTime(alumniEvent.end)}</p>
                  </div>
                </div>

                <div className="service-event-meta">
                  <p>
                    <strong>Description:</strong> {alumniEvent.description || "No description provided."}
                  </p>
                  <p>
                    <strong>Location:</strong> {details.location || "Not set"}
                  </p>
                  <p>
                    <strong>Audiences:</strong> brother, alum
                    {alumniEvent.visible_to_neophyte ? ", neophyte" : ""}
                  </p>
                </div>

                <form
                  className="alumni-location-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveLocation(alumniEvent.id, details);
                  }}
                >
                  <Input
                    label="Location"
                    placeholder="Location"
                    value={locationInputValue}
                    onChange={(event) =>
                      setLocationInputs((current) => ({
                        ...current,
                        [alumniEvent.id]: event.target.value,
                      }))
                    }
                    disabled={savingEvent}
                  />
                  <Button type="submit" variant="outline-secondary" loading={savingEvent} disabled={savingEvent}>
                    Save location
                  </Button>
                </form>
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}

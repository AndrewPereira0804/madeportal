import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../../auth/authContext";
import { canManageProfessionalDevelopmentEvents } from "../../../auth/roleAccess";
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
  compareEventDateTimes,
  formatEventDateTime,
  isEventEndAfterStart,
  toEventTimestamp,
} from "../../../lib/eventDateTime";
import {
  createProfessionalDevelopmentEventDetails,
  mergeProfessionalDevelopmentSpeaker,
  normalizeProfessionalDevelopmentEventDetails,
  type ProfessionalDevelopmentEventDetails,
} from "../../../lib/professionalDevelopmentEvents";

type ProfessionalDevelopmentEventRow = {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  event_type: "professional_development";
  start: string;
  end: string;
  created_by: string;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
  event_tags: string[] | null;
  details: unknown;
};

type ProfessionalDevelopmentDraft = {
  title: string;
  description: string;
  speaker: string;
  start: string;
  end: string;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
};

type ProfessionalDevelopmentEventsToolProps = {
  ownerLabel: string;
  returnPath: string;
};

const professionalDevelopmentEventSelect =
  "id, created_at, title, description, event_type, event_tags, start, end, created_by, visible_to_alum, visible_to_neophyte, details";

const emptyDraft: ProfessionalDevelopmentDraft = {
  title: "",
  description: "",
  speaker: "",
  start: "",
  end: "",
  visible_to_alum: false,
  visible_to_neophyte: false,
};

function dbError(action: string, message: string) {
  return `Database error while trying to ${action}: ${message}`;
}

function getSpeakerInputValue(
  speakerInputs: Record<string, string>,
  eventId: string,
  details: ProfessionalDevelopmentEventDetails,
) {
  return speakerInputs[eventId] ?? details.speaker;
}

export default function ProfessionalDevelopmentEventsTool({
  ownerLabel,
  returnPath,
}: ProfessionalDevelopmentEventsToolProps) {
  const { session } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const canManage = useMemo(() => canManageProfessionalDevelopmentEvents(roles), [roles]);
  const userId = session?.user?.id ?? null;

  const [events, setEvents] = useState<ProfessionalDevelopmentEventRow[]>([]);
  const [draft, setDraft] = useState<ProfessionalDevelopmentDraft>(emptyDraft);
  const [speakerInputs, setSpeakerInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadProfessionalDevelopmentEvents() {
      setLoading(true);
      setErrorMessage(null);
      setNoticeMessage(null);

      const { data, error } = await supabase
        .from("events")
        .select(professionalDevelopmentEventSelect)
        .eq("event_type", "professional_development")
        .order("start", { ascending: true });

      if (ignore) {
        return;
      }

      if (error) {
        setEvents([]);
        setErrorMessage(dbError("load professional development events", error.message));
      } else {
        setEvents((data ?? []) as ProfessionalDevelopmentEventRow[]);
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

    void loadProfessionalDevelopmentEvents();

    return () => {
      ignore = true;
    };
  }, [canManage, rolesLoading]);

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || !userId) {
      setErrorMessage("You do not have permission to create professional development events.");
      return;
    }

    const title = draft.title.trim();
    const description = draft.description.trim();

    if (!title || !draft.start || !draft.end) {
      setErrorMessage("Title, start, and end are required.");
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
        event_type: "professional_development",
        event_tags: ["professional_development"],
        start: toEventTimestamp(draft.start),
        end: toEventTimestamp(draft.end),
        created_by: userId,
        visible_to_alum: draft.visible_to_alum,
        visible_to_neophyte: draft.visible_to_neophyte,
        details: createProfessionalDevelopmentEventDetails(draft.speaker),
      })
      .select(professionalDevelopmentEventSelect)
      .single();

    if (error) {
      setErrorMessage(dbError("create this professional development event", error.message));
    } else if (data) {
      setEvents((current) =>
        [...current, data as ProfessionalDevelopmentEventRow].sort((a, b) =>
          compareEventDateTimes(a.start, b.start)
        )
      );
      setDraft(emptyDraft);
      setNoticeMessage("Professional development event created.");
    }

    setSaving(false);
  }

  async function saveSpeaker(eventId: string, currentDetails: ProfessionalDevelopmentEventDetails) {
    const target = events.find((professionalEvent) => professionalEvent.id === eventId);
    if (!target) {
      setErrorMessage("Could not find that professional development event.");
      return;
    }

    const speaker = getSpeakerInputValue(speakerInputs, eventId, currentDetails);

    setUpdatingEventId(eventId);
    setErrorMessage(null);
    setNoticeMessage(null);

    const { data, error } = await supabase
      .from("events")
      .update({
        details: mergeProfessionalDevelopmentSpeaker(target.details, speaker),
      })
      .eq("id", eventId)
      .select(professionalDevelopmentEventSelect)
      .single();

    if (error) {
      setErrorMessage(dbError("update the speaker", error.message));
    } else if (data) {
      setEvents((current) =>
        current.map((professionalEvent) =>
          professionalEvent.id === eventId ? (data as ProfessionalDevelopmentEventRow) : professionalEvent
        )
      );
      setSpeakerInputs((current) => {
        const next = { ...current };
        delete next[eventId];
        return next;
      });
      setNoticeMessage("Speaker updated.");
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
        title="Professional Development Events"
        subtitle="Create professional development events with an optional public speaker field."
        bordered
        actions={<Button to={returnPath} variant="outline-secondary">Professional Development Tools</Button>}
      />

      <form className="party-tool-form" onSubmit={handleCreateEvent}>
        <SectionHeader
          size="sm"
          title="Create professional development event"
          description="Professional development events publish to the chapter calendar with the selected audiences."
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
            label="Speaker"
            placeholder="Optional speaker"
            value={draft.speaker}
            onChange={(event) => setDraft((current) => ({ ...current, speaker: event.target.value }))}
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
            id="professionalDevelopmentAlumVisibility"
            className="form-check-input"
            type="checkbox"
            checked={draft.visible_to_alum}
            onChange={(event) => setDraft((current) => ({ ...current, visible_to_alum: event.target.checked }))}
          />
          <label className="form-check-label" htmlFor="professionalDevelopmentAlumVisibility">
            Visible to alum
          </label>
        </div>

        <div className="form-check">
          <input
            id="professionalDevelopmentNeophyteVisibility"
            className="form-check-input"
            type="checkbox"
            checked={draft.visible_to_neophyte}
            onChange={(event) => setDraft((current) => ({ ...current, visible_to_neophyte: event.target.checked }))}
          />
          <label className="form-check-label" htmlFor="professionalDevelopmentNeophyteVisibility">
            Visible to neophyte
          </label>
        </div>

        <div className="d-flex gap-2 mt-3 flex-wrap">
          <Button type="submit" loading={saving} disabled={saving || rolesLoading}>
            Create event
          </Button>
        </div>
      </form>

      {loading && <p className="announcements-state">Loading professional development events...</p>}
      {errorMessage && <div className="alert alert-danger mt-3 mb-0">{errorMessage}</div>}
      {noticeMessage && <div className="alert alert-success mt-3 mb-0">{noticeMessage}</div>}

      {!loading && events.length === 0 && (
        <EmptyState
          title="No professional development events"
          description="Professional development events created from this tool will appear here."
        />
      )}

      {!loading && events.length > 0 && (
        <div className="party-event-list">
          {events.map((professionalEvent) => {
            const details = normalizeProfessionalDevelopmentEventDetails(professionalEvent.details);
            const speakerInputValue = getSpeakerInputValue(speakerInputs, professionalEvent.id, details);
            const savingEvent = updatingEventId === professionalEvent.id;

            return (
              <article key={professionalEvent.id} className="party-event-card service-event-card">
                <div className="party-event-summary">
                  <div>
                    <EventTagBadges eventTags={professionalEvent.event_tags} eventType="professional_development" />
                    <h3>{professionalEvent.title}</h3>
                    <p>{formatEventDateTime(professionalEvent.start)} to {formatEventDateTime(professionalEvent.end)}</p>
                  </div>
                </div>

                <div className="service-event-meta">
                  <p>
                    <strong>Description:</strong> {professionalEvent.description || "No description provided."}
                  </p>
                  <p>
                    <strong>Speaker:</strong> {details.speaker || "Not set"}
                  </p>
                  <p>
                    <strong>Audiences:</strong> brother
                    {professionalEvent.visible_to_alum ? ", alum" : ""}
                    {professionalEvent.visible_to_neophyte ? ", neophyte" : ""}
                  </p>
                </div>

                <form
                  className="professional-speaker-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveSpeaker(professionalEvent.id, details);
                  }}
                >
                  <Input
                    label="Speaker"
                    placeholder="Optional speaker"
                    value={speakerInputValue}
                    onChange={(event) =>
                      setSpeakerInputs((current) => ({
                        ...current,
                        [professionalEvent.id]: event.target.value,
                      }))
                    }
                    disabled={savingEvent}
                  />
                  <Button type="submit" variant="outline-secondary" loading={savingEvent} disabled={savingEvent}>
                    Save speaker
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

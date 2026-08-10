import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../../auth/authContext";
import { canManagePartyEvents } from "../../../auth/roleAccess";
import useRoles from "../../../auth/useRoles";
import EventTagBadges from "../../../components/events/EventTagBadges";
import { Badge, Button, Card, EmptyState, Input, PageHeader, SectionHeader } from "../../../components/ui";
import supabase from "../../../config/supabaseClient";
import {
  compareEventDateTimes,
  formatEventDateTime,
  isEventEndAfterStart,
  toEventTimestamp,
} from "../../../lib/eventDateTime";
import {
  createPartyChecklistItem,
  createPartyEventDetails,
  normalizePartyEventDetails,
  type PartyChecklistKey,
  type PartyChecklistItem,
  type PartyEventDetails,
} from "../../../lib/partyEvents";

type PartyEventRow = {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  event_type: "party";
  start: string;
  end: string;
  created_by: string;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
  event_tags: string[] | null;
  details: unknown;
};

type PartyDraft = {
  theme: string;
  inviteListUrl: string;
  start: string;
  end: string;
};

type PartyEventsToolProps = {
  ownerLabel?: string;
  returnPath?: string;
};

const partyEventSelect =
  "id, created_at, title, description, event_type, event_tags, start, end, created_by, visible_to_alum, visible_to_neophyte, details";

const emptyDraft: PartyDraft = {
  theme: "",
  inviteListUrl: "",
  start: "",
  end: "",
};

function normalizeOptionalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function dbError(action: string, message: string) {
  return `Database error while trying to ${action}: ${message}`;
}

function getChecklistTitle(checklistKey: PartyChecklistKey) {
  return checklistKey === "preChecklist" ? "Pre-party checklist" : "Post-party checklist";
}

function PartyChecklist({
  title,
  items,
  inputValue,
  saving,
  onInputChange,
  onAdd,
  onToggle,
  onRemove,
}: {
  title: string;
  items: PartyChecklistItem[];
  inputValue: string;
  saving: boolean;
  onInputChange: (value: string) => void;
  onAdd: () => void;
  onToggle: (itemId: string) => void;
  onRemove: (itemId: string) => void;
}) {
  return (
    <section className="party-checklist-panel">
      <div className="party-checklist-heading">
        <h4>{title}</h4>
        <Badge variant="neutral">{items.filter((item) => item.completed).length}/{items.length}</Badge>
      </div>

      {items.length === 0 ? (
        <p className="party-checklist-empty">No checklist items.</p>
      ) : (
        <div className="party-checklist-items">
          {items.map((item) => (
            <div key={item.id} className="party-checklist-row">
              <label>
                <input
                  type="checkbox"
                  checked={item.completed}
                  disabled={saving}
                  onChange={() => onToggle(item.id)}
                />
                <span>{item.text}</span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => onRemove(item.id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <form
        className="party-checklist-add"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd();
        }}
      >
        <Input
          aria-label={`Add item to ${title}`}
          placeholder="New checklist item"
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
        />
        <Button type="submit" variant="outline-secondary" size="sm" disabled={saving || !inputValue.trim()}>
          Add
        </Button>
      </form>
    </section>
  );
}

export default function PartyEventsTool({
  ownerLabel = "Social Chairman",
  returnPath = "/app/tools/social-chair",
}: PartyEventsToolProps = {}) {
  const { session } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const canManage = useMemo(() => canManagePartyEvents(roles), [roles]);
  const userId = session?.user?.id ?? null;

  const [events, setEvents] = useState<PartyEventRow[]>([]);
  const [draft, setDraft] = useState<PartyDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checklistInputs, setChecklistInputs] = useState<Record<string, Partial<Record<PartyChecklistKey, string>>>>({});

  useEffect(() => {
    let ignore = false;

    async function loadPartyEvents() {
      setLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("events")
        .select(partyEventSelect)
        .eq("event_type", "party")
        .order("start", { ascending: true });

      if (ignore) {
        return;
      }

      if (error) {
        setEvents([]);
        setErrorMessage(dbError("load party events", error.message));
      } else {
        setEvents((data ?? []) as PartyEventRow[]);
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

    void loadPartyEvents();

    return () => {
      ignore = true;
    };
  }, [canManage, rolesLoading]);

  async function handleCreateParty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || !userId) {
      setErrorMessage("You do not have permission to create party events.");
      return;
    }

    const theme = draft.theme.trim();
    const inviteListUrl = normalizeOptionalUrl(draft.inviteListUrl);

    if (!theme || !draft.start || !draft.end) {
      setErrorMessage("Theme, start, and end are required.");
      return;
    }

    if (inviteListUrl === null) {
      setErrorMessage("Enter a valid Google Sheets link.");
      return;
    }

    if (!isEventEndAfterStart(draft.start, draft.end)) {
      setErrorMessage("End date/time must be after start date/time.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    const details = createPartyEventDetails(theme, inviteListUrl);
    const { data, error } = await supabase
      .from("events")
      .insert({
        title: `Party: ${theme}`,
        description: `Theme: ${theme}`,
        event_type: "party",
        event_tags: ["party"],
        start: toEventTimestamp(draft.start),
        end: toEventTimestamp(draft.end),
        created_by: userId,
        visible_to_alum: false,
        visible_to_neophyte: false,
        details,
      })
      .select(partyEventSelect)
      .single();

    if (error) {
      setErrorMessage(dbError("create this party", error.message));
    } else if (data) {
      setEvents((current) =>
        [...current, data as PartyEventRow].sort((a, b) => compareEventDateTimes(a.start, b.start))
      );
      setDraft(emptyDraft);
    }

    setSaving(false);
  }

  async function updatePartyDetails(
    eventId: string,
    updater: (details: PartyEventDetails) => PartyEventDetails,
    action: string,
  ) {
    const target = events.find((partyEvent) => partyEvent.id === eventId);
    if (!target) {
      setErrorMessage("Could not find that party event.");
      return;
    }

    setUpdatingEventId(eventId);
    setErrorMessage(null);

    const nextDetails = updater(normalizePartyEventDetails(target.details));
    const { data, error } = await supabase
      .from("events")
      .update({ details: nextDetails })
      .eq("id", eventId)
      .select(partyEventSelect)
      .single();

    if (error) {
      setErrorMessage(dbError(action, error.message));
    } else if (data) {
      setEvents((current) => current.map((partyEvent) => (partyEvent.id === eventId ? (data as PartyEventRow) : partyEvent)));
    }

    setUpdatingEventId(null);
  }

  function setChecklistInput(eventId: string, checklistKey: PartyChecklistKey, value: string) {
    setChecklistInputs((current) => ({
      ...current,
      [eventId]: {
        ...current[eventId],
        [checklistKey]: value,
      },
    }));
  }

  async function addChecklistItem(eventId: string, checklistKey: PartyChecklistKey) {
    const value = checklistInputs[eventId]?.[checklistKey]?.trim() ?? "";
    if (!value) {
      return;
    }

    await updatePartyDetails(
      eventId,
      (details) => ({
        ...details,
        [checklistKey]: [...details[checklistKey], createPartyChecklistItem(value)],
      }),
      "add a checklist item",
    );

    setChecklistInput(eventId, checklistKey, "");
  }

  async function toggleChecklistItem(eventId: string, checklistKey: PartyChecklistKey, itemId: string) {
    await updatePartyDetails(
      eventId,
      (details) => ({
        ...details,
        [checklistKey]: details[checklistKey].map((item) =>
          item.id === itemId ? { ...item, completed: !item.completed } : item
        ),
      }),
      "update a checklist item",
    );
  }

  async function removeChecklistItem(eventId: string, checklistKey: PartyChecklistKey, itemId: string) {
    await updatePartyDetails(
      eventId,
      (details) => ({
        ...details,
        [checklistKey]: details[checklistKey].filter((item) => item.id !== itemId),
      }),
      "remove a checklist item",
    );
  }

  if (!rolesLoading && !canManage) {
    return <Navigate to={returnPath} replace />;
  }

  return (
    <Card className="tools-page">
      <PageHeader
        eyebrow={ownerLabel}
        title="Party Events"
        subtitle="Create party calendar events and track party-specific checklists."
        bordered
        actions={<Button to={returnPath} variant="outline-secondary">{ownerLabel} Tools</Button>}
      />

      <form className="party-tool-form" onSubmit={handleCreateParty}>
        <SectionHeader
          size="sm"
          title="Create party"
          description="Party events publish a calendar entry and keep checklist work in this tool."
        />

        <div className="budget-form-grid">
          <Input
            className="budget-form-full"
            label="Theme"
            placeholder="Party theme"
            value={draft.theme}
            onChange={(event) => setDraft((current) => ({ ...current, theme: event.target.value }))}
          />
          <Input
            className="budget-form-full"
            label="Google Sheets invite list"
            placeholder="https://docs.google.com/spreadsheets/..."
            value={draft.inviteListUrl}
            onChange={(event) => setDraft((current) => ({ ...current, inviteListUrl: event.target.value }))}
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
            Create party
          </Button>
        </div>
      </form>

      {loading && <p className="announcements-state">Loading party events...</p>}
      {errorMessage && <p className="mt-4 text-danger">{errorMessage}</p>}

      {!loading && events.length === 0 && (
        <EmptyState
          title="No party events"
          description="Party events created from this tool will appear here."
        />
      )}

      {!loading && events.length > 0 && (
        <div className="party-event-list">
          {events.map((partyEvent) => {
            const details = normalizePartyEventDetails(partyEvent.details);
            const savingChecklist = updatingEventId === partyEvent.id;

            return (
              <article key={partyEvent.id} className="party-event-card">
                <div className="party-event-summary">
                  <div>
                    <EventTagBadges eventTags={partyEvent.event_tags} eventType="party" />
                    <h3>{details.theme || partyEvent.title}</h3>
                    <p>{formatEventDateTime(partyEvent.start)} to {formatEventDateTime(partyEvent.end)}</p>
                  </div>
                  {details.inviteListUrl ? (
                    <Button
                      href={details.inviteListUrl}
                      target="_blank"
                      rel="noreferrer"
                      variant="outline-secondary"
                      size="sm"
                    >
                      Invite list
                    </Button>
                  ) : (
                    <Badge variant="warning">No invite list</Badge>
                  )}
                </div>

                <div className="party-checklist-grid">
                  {(["preChecklist", "postChecklist"] as PartyChecklistKey[]).map((checklistKey) => (
                    <PartyChecklist
                      key={checklistKey}
                      title={getChecklistTitle(checklistKey)}
                      items={details[checklistKey]}
                      inputValue={checklistInputs[partyEvent.id]?.[checklistKey] ?? ""}
                      saving={savingChecklist}
                      onInputChange={(value) => setChecklistInput(partyEvent.id, checklistKey, value)}
                      onAdd={() => void addChecklistItem(partyEvent.id, checklistKey)}
                      onToggle={(itemId) => void toggleChecklistItem(partyEvent.id, checklistKey, itemId)}
                      onRemove={(itemId) => void removeChecklistItem(partyEvent.id, checklistKey, itemId)}
                    />
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}

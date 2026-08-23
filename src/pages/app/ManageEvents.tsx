import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import supabase from "../../config/supabaseClient";
import { useAuth } from "../../auth/authContext";
import {
  canManageAllEvents,
  canManageEvent,
  canManageEventType,
  canManageEvents as canManageRoleEvents,
  getManageableEventTypes,
} from "../../auth/roleAccess";
import useRoles from "../../auth/useRoles";
import { ActionCard, Badge, Button, Card, EmptyState, Input, PageHeader, SectionHeader, Select, Textarea } from "../../components/ui";
import EventTagBadges from "../../components/events/EventTagBadges";
import {
  defaultEventType,
  eventTypeOptions,
  eventHasTag,
  normalizeEventTags,
  normalizeEventType,
  type EventTypeSlug,
} from "../../lib/eventTypes";
import {
  getEventToolDefinitionsForEventTypes,
  getEventToolPath,
  getPreferredEventToolOwner,
} from "../../lib/eventTools";
import {
  compareEventDateTimes,
  formatEventDateTime,
  isEventEndAfterStart,
  toEventDateTimeInputValue,
  toEventTimestamp,
} from "../../lib/eventDateTime";

type EventRow = {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  created_by: string;
  event_type: EventTypeSlug | null;
  event_tags: EventTypeSlug[] | null;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
};

type EventDraft = {
  title: string;
  description: string;
  event_type: EventTypeSlug;
  event_tags: EventTypeSlug[];
  start: string;
  end: string;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
};

type ManageEventsProps = {
  title?: string;
  subtitle?: string;
  returnPath?: string;
  returnLabel?: string;
  scopedEventTypes?: EventTypeSlug[];
};

function dbError(action: string, message: string) {
  return `Database error while trying to ${action}: ${message}`;
}

function uniqueEventTypes(eventTypes: EventTypeSlug[]) {
  return eventTypes.filter((eventType, index) => eventTypes.indexOf(eventType) === index);
}

export default function ManageEvents({
  title = "Manage Events",
  subtitle = "Create, edit, and delete events you are permitted to manage.",
  returnPath = "/app/scheduling",
  returnLabel = "Back to Calendar",
  scopedEventTypes,
}: ManageEventsProps = {}) {
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
    event_type: defaultEventType,
    event_tags: [],
    start: "",
    end: "",
    visible_to_alum: false,
    visible_to_neophyte: false,
  });

  const userId = session?.user?.id ?? null;
  const canManageAll = useMemo(() => canManageAllEvents(roles), [roles]);
  const scopedEventTypeList = useMemo(
    () => scopedEventTypes ? uniqueEventTypes(scopedEventTypes) : null,
    [scopedEventTypes]
  );
  const scopedEventTypeSet = useMemo(
    () => scopedEventTypeList ? new Set<EventTypeSlug>(scopedEventTypeList) : null,
    [scopedEventTypeList]
  );
  const manageableEventTypes = useMemo(() => getManageableEventTypes(roles), [roles]);
  const visibleManageableEventTypes = useMemo(
    () =>
      scopedEventTypeSet
        ? manageableEventTypes.filter((eventType) => scopedEventTypeSet.has(eventType))
        : manageableEventTypes,
    [manageableEventTypes, scopedEventTypeSet]
  );
  const canManage = useMemo(
    () =>
      scopedEventTypeSet
        ? canManageAll || visibleManageableEventTypes.length > 0
        : canManageRoleEvents(roles),
    [canManageAll, roles, scopedEventTypeSet, visibleManageableEventTypes]
  );
  const createEventTypeOptions = useMemo(() => {
    const baseEventTypeOptions = scopedEventTypeSet ? eventTypeOptions : [];
    const allowedOptions =
      canManageAll
        ? baseEventTypeOptions
        : baseEventTypeOptions.filter((eventType) => visibleManageableEventTypes.includes(eventType.slug));

    if (!scopedEventTypeSet) {
      return allowedOptions;
    }

    return allowedOptions.filter((eventType) => scopedEventTypeSet.has(eventType.slug));
  }, [canManageAll, scopedEventTypeSet, visibleManageableEventTypes]);
  const canCreateFromManager = Boolean(scopedEventTypeSet && createEventTypeOptions.length > 0);
  const createEventToolDefinitions = useMemo(
    () =>
      scopedEventTypeSet
        ? []
        : getEventToolDefinitionsForEventTypes(visibleManageableEventTypes),
    [scopedEventTypeSet, visibleManageableEventTypes]
  );
  const defaultDraftEventType = createEventTypeOptions.some((eventType) => eventType.slug === defaultEventType)
    ? defaultEventType
    : createEventTypeOptions[0]?.slug ?? defaultEventType;
  const selectedCreateEventType = createEventTypeOptions.some((eventType) => eventType.slug === draft.event_type)
    ? draft.event_type
    : defaultDraftEventType;
  const eventTypeSelectOptions = editingId ? eventTypeOptions : createEventTypeOptions;
  const selectedFormEventType = editingId ? draft.event_type : selectedCreateEventType;
  const selectedFormEventTags = normalizeEventTags(draft.event_tags, selectedFormEventType);
  const isAlumniEventSelected = selectedFormEventTags.includes("alumni_event");
  const canCreateSelectedEventType =
    canManageEventType(roles, selectedCreateEventType);

  const canEditOrDeleteEvent = (event: EventRow) => {
    return canManageEvent(roles, event.created_by, userId, event.event_type);
  };

  useEffect(() => {
    let ignore = false;

    async function fetchEvents() {
      setLoading(true);
      setErrorMessage(null);

      if (!canManageAll && visibleManageableEventTypes.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }

      let query = supabase
        .from("events")
        .select("id, created_at, title, description, event_type, event_tags, start, end, created_by, visible_to_alum, visible_to_neophyte");

      if (scopedEventTypeList) {
        query = query.in("event_type", scopedEventTypeList);
      }

      if (!canManageAll) {
        if (visibleManageableEventTypes.length > 0) {
          query = query.in("event_type", visibleManageableEventTypes);
        }
      }

      const { data, error } = await query.order("start", { ascending: true });
      let nextEvents = (data ?? []) as EventRow[];

      if (error) {
        if (ignore) return;
        setEvents([]);
        setErrorMessage(dbError("load events", error.message));
      } else {
        if (ignore) return;
        if (scopedEventTypeSet) {
          nextEvents = nextEvents.filter((event) => Boolean(event.event_type && scopedEventTypeSet.has(event.event_type)));
        }

        if (!canManageAll) {
          nextEvents = nextEvents.filter((event) => canManageEvent(roles, event.created_by, userId, event.event_type));
        }

        setEvents(nextEvents);
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
  }, [
    canManage,
    canManageAll,
    roles,
    rolesLoading,
    scopedEventTypeList,
    scopedEventTypeSet,
    userId,
    visibleManageableEventTypes,
  ]);

  function resetDraft() {
    setEditingId(null);
    setDraft({
      title: "",
      description: "",
      event_type: defaultDraftEventType,
      event_tags: [defaultDraftEventType],
      start: "",
      end: "",
      visible_to_alum: defaultDraftEventType === "alumni_event",
      visible_to_neophyte: false,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || !userId) {
      setErrorMessage("You do not have permission to create or update events.");
      return;
    }

    const eventTypeForSave = editingId ? draft.event_type : selectedCreateEventType;

    if (!draft.title.trim() || !draft.start || !draft.end) {
      setErrorMessage("Title, start, and end are required.");
      return;
    }

    if (!editingId && (!canCreateFromManager || !canCreateSelectedEventType)) {
      setErrorMessage("Use the role-specific tool for that event type.");
      return;
    }

    if (!isEventEndAfterStart(draft.start, draft.end)) {
      setErrorMessage("End date/time must be after start date/time.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    const eventTagsForSave = normalizeEventTags(draft.event_tags, eventTypeForSave);
    const eventPayload = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      event_type: eventTypeForSave,
      event_tags: eventTagsForSave,
      start: toEventTimestamp(draft.start),
      end: toEventTimestamp(draft.end),
      visible_to_alum: eventTagsForSave.includes("alumni_event") || draft.visible_to_alum,
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
        .update(eventPayload)
        .eq("id", editingId)
        .select("id, created_at, title, description, event_type, event_tags, start, end, created_by, visible_to_alum, visible_to_neophyte")
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
        .insert({
          ...eventPayload,
          created_by: userId,
        })
        .select("id, created_at, title, description, event_type, event_tags, start, end, created_by, visible_to_alum, visible_to_neophyte")
        .single();

      if (error) {
        setErrorMessage(dbError("create an event", error.message));
      } else if (data) {
        setEvents((current) => [...current, data as EventRow].sort((a, b) => compareEventDateTimes(a.start, b.start)));
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
      event_type: normalizeEventType(event.event_type),
      event_tags: normalizeEventTags(event.event_tags, event.event_type),
      start: toEventDateTimeInputValue(event.start),
      end: toEventDateTimeInputValue(event.end),
      visible_to_alum: eventHasTag(event.event_tags, "alumni_event", event.event_type) || event.visible_to_alum,
      visible_to_neophyte: event.visible_to_neophyte,
    });
  }

  function toggleDraftEventTag(eventType: EventTypeSlug, checked: boolean) {
    setDraft((current) => {
      const primaryEventType = normalizeEventType(editingId ? current.event_type : selectedCreateEventType);
      const nextTags = checked
        ? [...current.event_tags, eventType]
        : current.event_tags.filter((tag) => tag !== eventType);

      return {
        ...current,
        event_tags: normalizeEventTags(nextTags, primaryEventType),
        visible_to_alum: eventType === "alumni_event" && checked ? true : current.visible_to_alum,
      };
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
        title={title}
        subtitle={subtitle}
        bordered
        actions={<Button to={returnPath} variant="outline-secondary">{returnLabel}</Button>}
      />

      {!editingId && !scopedEventTypeSet && (
        <section className="mt-4">
          <SectionHeader
            size="sm"
            title="Create event"
            description="Choose the event tool for the type you want to create."
          />

          {createEventToolDefinitions.length === 0 ? (
            <EmptyState
              compact
              title="No creation tools available"
              description="Event creation tools will appear here when your role can create events."
            />
          ) : (
            <div className="action-card-grid tools-grid mt-3">
              {createEventToolDefinitions.map((definition) => {
                const ownerRoleSlug = getPreferredEventToolOwner(definition, roles);

                return (
                  <ActionCard
                    key={definition.eventType}
                    to={getEventToolPath(definition, ownerRoleSlug)}
                    eyebrow="Create"
                    title={definition.title}
                    description={definition.description}
                    meta={definition.meta}
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      {(editingId || canCreateFromManager) && (
        <form className="event-management-form" onSubmit={handleSubmit}>
          <SectionHeader
            size="sm"
            title={editingId ? "Update event" : "Create event"}
            description={
              editingId
                ? "Event type is locked while editing. Use role-specific tools for type-specific details."
                : "Brother visibility is always included. Add additional audiences only when needed."
            }
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
            <Select
              className="budget-form-full"
              id="eventType"
              label="Event type"
              value={selectedFormEventType}
              disabled={Boolean(editingId)}
              onChange={(event) =>
                setDraft((current) => {
                  const nextEventType = normalizeEventType(event.target.value);
                  return {
                    ...current,
                    event_type: nextEventType,
                    event_tags: normalizeEventTags(current.event_tags, nextEventType),
                    visible_to_alum: nextEventType === "alumni_event" || current.visible_to_alum,
                  };
                })
              }
            >
              {eventTypeSelectOptions.map((eventType) => (
                <option key={eventType.slug} value={eventType.slug}>
                  {eventType.label}
                </option>
              ))}
            </Select>
            <fieldset className="budget-form-full event-tag-fieldset">
              <legend>Tags</legend>
              <div className="event-tag-option-grid">
                {eventTypeOptions.map((eventType) => {
                  const checked = selectedFormEventTags.includes(eventType.slug);
                  const isPrimaryTag = eventType.slug === selectedFormEventType;

                  return (
                    <label key={eventType.slug} className="event-tag-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isPrimaryTag}
                        onChange={(event) => toggleDraftEventTag(eventType.slug, event.target.checked)}
                      />
                      <span>{eventType.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
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

          {isAlumniEventSelected ? (
            <div className="d-flex gap-2 mt-3 flex-wrap">
              <Badge variant="info">alum visible</Badge>
            </div>
          ) : (
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
          )}

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
      )}

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
                <strong>Starts:</strong> {formatEventDateTime(event.start)}
              </p>
              <p className="mb-1">
                <strong>Ends:</strong> {formatEventDateTime(event.end)}
              </p>
              <div className="d-flex gap-2 flex-wrap mt-2">
                <EventTagBadges eventTags={event.event_tags} eventType={event.event_type} />
                <Badge variant="info">brother</Badge>
                {(eventHasTag(event.event_tags, "alumni_event", event.event_type) || event.visible_to_alum) && <Badge variant="info">alum</Badge>}
                {event.visible_to_neophyte && <Badge variant="info">neophyte</Badge>}
              </div>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

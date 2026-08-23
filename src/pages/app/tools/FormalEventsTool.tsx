import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../../auth/authContext";
import { canManageFormalEvents } from "../../../auth/roleAccess";
import useRoles from "../../../auth/useRoles";
import EventTagBadges from "../../../components/events/EventTagBadges";
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
} from "../../../components/ui";
import supabase from "../../../config/supabaseClient";
import {
  compareEventDateTimes,
  formatEventDateTime,
  isEventEndAfterStart,
  toEventTimestamp,
} from "../../../lib/eventDateTime";
import {
  calculateFormalAttendeeOwed,
  calculateFormalTotals,
  createFormalAttendee,
  createFormalChecklistItem,
  createFormalEventDetails,
  normalizeFormalEventDetails,
  type FormalAttendee,
  type FormalChecklistItem,
  type FormalEventDetails,
} from "../../../lib/formalEvents";

type FormalEventRow = {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  event_type: "formal";
  start: string;
  end: string;
  created_by: string;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
  event_tags: string[] | null;
  details: unknown;
};

type FormalDraft = {
  theme: string;
  totalCost: string;
  start: string;
  end: string;
};

type AttendeeDraft = {
  brotherName: string;
  drinkingGuestCount: string;
};

type FormalEventsToolProps = {
  ownerLabel?: string;
  returnPath?: string;
};

const formalEventSelect =
  "id, created_at, title, description, event_type, event_tags, start, end, created_by, visible_to_alum, visible_to_neophyte, details";

const emptyDraft: FormalDraft = {
  theme: "",
  totalCost: "",
  start: "",
  end: "",
};

const emptyAttendeeDraft: AttendeeDraft = {
  brotherName: "",
  drinkingGuestCount: "0",
};

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatMoney(value: number) {
  return moneyFormatter.format(value);
}

function parseTotalCost(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseGuestCount(value: string) {
  const trimmed = value.trim();
  const parsed = Number(trimmed || "0");
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function dbError(action: string, message: string) {
  return `Database error while trying to ${action}: ${message}`;
}

function FormalSetupChecklist({
  items,
  inputValue,
  saving,
  onInputChange,
  onAdd,
  onToggle,
  onRemove,
}: {
  items: FormalChecklistItem[];
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
        <h4>Set up checklist</h4>
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
          aria-label="Add item to set up checklist"
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

function FormalAttendeeTable({
  attendees,
  pricePerDrinker,
  saving,
  onTogglePaid,
  onRemove,
}: {
  attendees: FormalAttendee[];
  pricePerDrinker: number;
  saving: boolean;
  onTogglePaid: (attendeeId: string) => void;
  onRemove: (attendeeId: string) => void;
}) {
  if (attendees.length === 0) {
    return (
      <EmptyState
        compact
        title="No brothers added"
        description="Add drinking brothers to calculate formal payments."
      />
    );
  }

  return (
    <Table minWidth={820} className="formal-attendee-table">
      <TableHead>
        <TableRow>
          <TableHeaderCell>Brother</TableHeaderCell>
          <TableHeaderCell>Guests</TableHeaderCell>
          <TableHeaderCell>Drinking total</TableHeaderCell>
          <TableHeaderCell>Owed</TableHeaderCell>
          <TableHeaderCell>Paid</TableHeaderCell>
          <TableHeaderCell>Actions</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {attendees.map((attendee) => (
          <TableRow key={attendee.id}>
            <TableCell>{attendee.brotherName}</TableCell>
            <TableCell>{attendee.drinkingGuestCount}</TableCell>
            <TableCell>{1 + attendee.drinkingGuestCount}</TableCell>
            <TableCell>{formatMoney(calculateFormalAttendeeOwed(attendee, pricePerDrinker))}</TableCell>
            <TableCell>
              <label className="formal-paid-toggle">
                <input
                  type="checkbox"
                  checked={attendee.paid}
                  disabled={saving}
                  onChange={() => onTogglePaid(attendee.id)}
                />
                <span>{attendee.paid ? "Paid" : "Unpaid"}</span>
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

export default function FormalEventsTool({
  ownerLabel = "Social Chairman",
  returnPath = "/app/tools/social-chair",
}: FormalEventsToolProps = {}) {
  const { session } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const canManage = useMemo(() => canManageFormalEvents(roles), [roles]);
  const userId = session?.user?.id ?? null;

  const [events, setEvents] = useState<FormalEventRow[]>([]);
  const [draft, setDraft] = useState<FormalDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [costInputs, setCostInputs] = useState<Record<string, string>>({});
  const [attendeeInputs, setAttendeeInputs] = useState<Record<string, AttendeeDraft>>({});
  const [checklistInputs, setChecklistInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    let ignore = false;

    async function loadFormalEvents() {
      setLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("events")
        .select(formalEventSelect)
        .eq("event_type", "formal")
        .order("start", { ascending: true });

      if (ignore) {
        return;
      }

      if (error) {
        setEvents([]);
        setErrorMessage(dbError("load formal events", error.message));
      } else {
        setEvents((data ?? []) as FormalEventRow[]);
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

    void loadFormalEvents();

    return () => {
      ignore = true;
    };
  }, [canManage, rolesLoading]);

  async function handleCreateFormal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || !userId) {
      setErrorMessage("You do not have permission to create formal events.");
      return;
    }

    const theme = draft.theme.trim();
    const totalCost = parseTotalCost(draft.totalCost);

    if (!theme || !draft.start || !draft.end) {
      setErrorMessage("Theme, start, and end are required.");
      return;
    }

    if (totalCost === null) {
      setErrorMessage("Total cost must be zero or greater.");
      return;
    }

    if (!isEventEndAfterStart(draft.start, draft.end)) {
      setErrorMessage("End date/time must be after start date/time.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    const details = createFormalEventDetails(theme, totalCost);
    const { data, error } = await supabase
      .from("events")
      .insert({
        title: `Formal: ${theme}`,
        description: `Theme: ${theme}`,
        event_type: "formal",
        event_tags: ["formal"],
        start: toEventTimestamp(draft.start),
        end: toEventTimestamp(draft.end),
        created_by: userId,
        visible_to_alum: false,
        visible_to_neophyte: false,
        details,
      })
      .select(formalEventSelect)
      .single();

    if (error) {
      setErrorMessage(dbError("create this formal", error.message));
    } else if (data) {
      setEvents((current) =>
        [...current, data as FormalEventRow].sort((a, b) => compareEventDateTimes(a.start, b.start))
      );
      setDraft(emptyDraft);
    }

    setSaving(false);
  }

  async function updateFormalDetails(
    eventId: string,
    updater: (details: FormalEventDetails) => FormalEventDetails,
    action: string,
  ) {
    const target = events.find((formalEvent) => formalEvent.id === eventId);
    if (!target) {
      setErrorMessage("Could not find that formal event.");
      return;
    }

    setUpdatingEventId(eventId);
    setErrorMessage(null);

    const nextDetails = updater(normalizeFormalEventDetails(target.details));
    const { data, error } = await supabase
      .from("events")
      .update({ details: nextDetails })
      .eq("id", eventId)
      .select(formalEventSelect)
      .single();

    if (error) {
      setErrorMessage(dbError(action, error.message));
    } else if (data) {
      setEvents((current) => current.map((formalEvent) => (formalEvent.id === eventId ? (data as FormalEventRow) : formalEvent)));
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

  async function saveTotalCost(eventId: string, currentTotalCost: number) {
    const nextCost = parseTotalCost(costInputs[eventId] ?? String(currentTotalCost));

    if (nextCost === null) {
      setErrorMessage("Total cost must be zero or greater.");
      return;
    }

    await updateFormalDetails(
      eventId,
      (details) => ({
        ...details,
        totalCost: nextCost,
      }),
      "update the formal cost",
    );

    setCostInputs((current) => {
      const next = { ...current };
      delete next[eventId];
      return next;
    });
  }

  async function addAttendee(eventId: string) {
    const attendeeDraft = attendeeInputs[eventId] ?? emptyAttendeeDraft;
    const brotherName = attendeeDraft.brotherName.trim();
    const drinkingGuestCount = parseGuestCount(attendeeDraft.drinkingGuestCount);

    if (!brotherName) {
      setErrorMessage("Brother name is required.");
      return;
    }

    if (drinkingGuestCount === null) {
      setErrorMessage("Drinking guests must be a whole number zero or greater.");
      return;
    }

    await updateFormalDetails(
      eventId,
      (details) => ({
        ...details,
        attendees: [...details.attendees, createFormalAttendee(brotherName, drinkingGuestCount)],
      }),
      "add a brother to the formal list",
    );

    setAttendeeInputs((current) => ({
      ...current,
      [eventId]: emptyAttendeeDraft,
    }));
  }

  async function toggleAttendeePaid(eventId: string, attendeeId: string) {
    await updateFormalDetails(
      eventId,
      (details) => ({
        ...details,
        attendees: details.attendees.map((attendee) =>
          attendee.id === attendeeId ? { ...attendee, paid: !attendee.paid } : attendee
        ),
      }),
      "update formal payment status",
    );
  }

  async function removeAttendee(eventId: string, attendeeId: string) {
    await updateFormalDetails(
      eventId,
      (details) => ({
        ...details,
        attendees: details.attendees.filter((attendee) => attendee.id !== attendeeId),
      }),
      "remove a brother from the formal list",
    );
  }

  async function addChecklistItem(eventId: string) {
    const value = checklistInputs[eventId]?.trim() ?? "";
    if (!value) {
      return;
    }

    await updateFormalDetails(
      eventId,
      (details) => ({
        ...details,
        setupChecklist: [...details.setupChecklist, createFormalChecklistItem(value)],
      }),
      "add a checklist item",
    );

    setChecklistInputs((current) => ({
      ...current,
      [eventId]: "",
    }));
  }

  async function toggleChecklistItem(eventId: string, itemId: string) {
    await updateFormalDetails(
      eventId,
      (details) => ({
        ...details,
        setupChecklist: details.setupChecklist.map((item) =>
          item.id === itemId ? { ...item, completed: !item.completed } : item
        ),
      }),
      "update a checklist item",
    );
  }

  async function removeChecklistItem(eventId: string, itemId: string) {
    await updateFormalDetails(
      eventId,
      (details) => ({
        ...details,
        setupChecklist: details.setupChecklist.filter((item) => item.id !== itemId),
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
        title="Formal Events"
        subtitle="Create formal calendar events, calculate brother payments, and track set up work."
        bordered
        actions={<Button to={returnPath} variant="outline-secondary">{ownerLabel} Tools</Button>}
      />

      <form className="party-tool-form" onSubmit={handleCreateFormal}>
        <SectionHeader
          size="sm"
          title="Create formal"
          description="Formal events publish a calendar entry and keep the drinking list, payments, and set up checklist in this tool."
        />

        <div className="budget-form-grid">
          <Input
            className="budget-form-full"
            label="Theme"
            placeholder="Formal theme"
            value={draft.theme}
            onChange={(event) => setDraft((current) => ({ ...current, theme: event.target.value }))}
          />
          <Input
            label="Total cost"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={draft.totalCost}
            onChange={(event) => setDraft((current) => ({ ...current, totalCost: event.target.value }))}
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
            Create formal
          </Button>
        </div>
      </form>

      {loading && <p className="announcements-state">Loading formal events...</p>}
      {errorMessage && <p className="mt-4 text-danger">{errorMessage}</p>}

      {!loading && events.length === 0 && (
        <EmptyState
          title="No formal events"
          description="Formal events created from this tool will appear here."
        />
      )}

      {!loading && events.length > 0 && (
        <div className="party-event-list">
          {events.map((formalEvent) => {
            const details = normalizeFormalEventDetails(formalEvent.details);
            const totals = calculateFormalTotals(details);
            const savingEvent = updatingEventId === formalEvent.id;
            const attendeeDraft = attendeeInputs[formalEvent.id] ?? emptyAttendeeDraft;
            const costInputValue =
              costInputs[formalEvent.id] ?? (details.totalCost > 0 ? String(details.totalCost) : "");

            return (
              <article key={formalEvent.id} className="party-event-card formal-event-card">
                <div className="party-event-summary">
                  <div>
                    <EventTagBadges eventTags={formalEvent.event_tags} eventType="formal" />
                    <h3>{details.theme || formalEvent.title}</h3>
                    <p>{formatEventDateTime(formalEvent.start)} to {formatEventDateTime(formalEvent.end)}</p>
                  </div>
                  <Badge variant={totals.unpaidAmount > 0 ? "warning" : "success"}>
                    {totals.paidBrotherCount}/{totals.brotherCount} paid
                  </Badge>
                </div>

                <div className="formal-metric-grid">
                  <MetricCard
                    label="Total cost"
                    value={formatMoney(details.totalCost)}
                    detail="entered by chair"
                    tone="gold"
                  />
                  <MetricCard
                    label="Total drinking"
                    value={totals.totalDrinking}
                    detail={`${totals.brotherCount} brother${totals.brotherCount === 1 ? "" : "s"} + ${totals.drinkingGuestCount} guest${totals.drinkingGuestCount === 1 ? "" : "s"}`}
                    tone="info"
                  />
                  <MetricCard
                    label="Per drinking person"
                    value={formatMoney(totals.pricePerDrinker)}
                    detail="total cost / total drinking"
                    tone="success"
                  />
                  <MetricCard
                    label="Unpaid amount"
                    value={formatMoney(totals.unpaidAmount)}
                    detail={totals.totalDrinking === 0 ? "waiting on list" : "based on unpaid rows"}
                    tone={totals.unpaidAmount > 0 ? "warning" : "success"}
                  />
                </div>

                <form
                  className="formal-cost-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveTotalCost(formalEvent.id, details.totalCost);
                  }}
                >
                  <Input
                    label="Total cost"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={costInputValue}
                    onChange={(event) =>
                      setCostInputs((current) => ({ ...current, [formalEvent.id]: event.target.value }))
                    }
                  />
                  <Button type="submit" variant="outline-secondary" disabled={savingEvent}>
                    Save cost
                  </Button>
                </form>

                <div className="formal-event-detail-grid">
                  <section className="formal-attendee-panel">
                    <SectionHeader
                      className="mt-0"
                      size="sm"
                      title="Drinking list"
                      description="Each row covers one drinking brother plus that brother's drinking guests."
                    />

                    <FormalAttendeeTable
                      attendees={details.attendees}
                      pricePerDrinker={totals.pricePerDrinker}
                      saving={savingEvent}
                      onTogglePaid={(attendeeId) => void toggleAttendeePaid(formalEvent.id, attendeeId)}
                      onRemove={(attendeeId) => void removeAttendee(formalEvent.id, attendeeId)}
                    />

                    <form
                      className="formal-attendee-add"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void addAttendee(formalEvent.id);
                      }}
                    >
                      <Input
                        label="Brother"
                        placeholder="Brother name"
                        value={attendeeDraft.brotherName}
                        onChange={(event) => setAttendeeInput(formalEvent.id, "brotherName", event.target.value)}
                      />
                      <Input
                        label="Drinking guests"
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={attendeeDraft.drinkingGuestCount}
                        onChange={(event) =>
                          setAttendeeInput(formalEvent.id, "drinkingGuestCount", event.target.value)
                        }
                      />
                      <Button type="submit" variant="outline-secondary" disabled={savingEvent}>
                        Add brother
                      </Button>
                    </form>
                  </section>

                  <FormalSetupChecklist
                    items={details.setupChecklist}
                    inputValue={checklistInputs[formalEvent.id] ?? ""}
                    saving={savingEvent}
                    onInputChange={(value) =>
                      setChecklistInputs((current) => ({ ...current, [formalEvent.id]: value }))
                    }
                    onAdd={() => void addChecklistItem(formalEvent.id)}
                    onToggle={(itemId) => void toggleChecklistItem(formalEvent.id, itemId)}
                    onRemove={(itemId) => void removeChecklistItem(formalEvent.id, itemId)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../../auth/authContext";
import {
  canManageEvent,
  canManageEventType,
  canTakeHouseMeetingAttendance,
} from "../../../auth/roleAccess";
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
  Textarea,
} from "../../../components/ui";
import supabase from "../../../config/supabaseClient";
import {
  attendanceStatusOptions,
  calculateAttendanceSummary,
  getAttendanceKey,
  getRequiredMemberDisplayName,
  normalizeAttendanceRow,
  sortRequiredAttendanceMembers,
  type AttendanceStatus,
  type EventAttendanceRow,
  type RequiredAttendanceMember,
} from "../../../lib/houseMeetingAttendance";
import {
  compareEventDateTimes,
  formatEventDateTime,
  isEventEndAfterStart,
  toEventDateTimeInputValue,
  toEventTimestamp,
} from "../../../lib/eventDateTime";
import {
  normalizeProfile,
  PROFILE_COLUMNS,
  toCleanString,
  type RawProfileRow,
} from "../profileTypes";

type HouseMeetingEventRow = {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  event_type: "house_meeting";
  start: string;
  end: string;
  created_by: string;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
  event_tags: string[] | null;
};

type HouseMeetingDraft = {
  title: string;
  description: string;
  start: string;
  end: string;
};

type RequiredMemberRoleRow = {
  user_id?: unknown;
  role_slug?: unknown;
};

type AttendanceRowsByEvent = Record<string, Record<string, EventAttendanceRow>>;

type HouseMeetingsToolProps = {
  ownerLabel?: string;
  returnPath?: string;
};

const houseMeetingEventSelect =
  "id, created_at, title, description, event_type, event_tags, start, end, created_by, visible_to_alum, visible_to_neophyte";

const attendanceSelect =
  "id, event_id, member_id, status, notes, recorded_by, recorded_at, created_at, updated_at";

const emptyDraft: HouseMeetingDraft = {
  title: "",
  description: "",
  start: "",
  end: "",
};

function dbError(action: string, message: string) {
  return `Database error while trying to ${action}: ${message}`;
}

function getStatusBadgeVariant(status: AttendanceStatus | null) {
  if (status === "present") {
    return "success";
  }

  if (status === "excused") {
    return "warning";
  }

  if (status === "absent") {
    return "danger";
  }

  return "neutral";
}

function getStatusLabel(status: AttendanceStatus | null) {
  return attendanceStatusOptions.find((option) => option.status === status)?.label ?? "Unmarked";
}

function cleanNote(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAttendanceRowsByEvent(rows: Record<string, unknown>[]) {
  const rowsByEvent: AttendanceRowsByEvent = {};
  const noteDrafts: Record<string, string> = {};

  for (const row of rows) {
    const attendanceRow = normalizeAttendanceRow(row);
    if (!attendanceRow) {
      continue;
    }

    rowsByEvent[attendanceRow.event_id] = {
      ...(rowsByEvent[attendanceRow.event_id] ?? {}),
      [attendanceRow.member_id]: attendanceRow,
    };
    noteDrafts[getAttendanceKey(attendanceRow.event_id, attendanceRow.member_id)] = attendanceRow.notes ?? "";
  }

  return { rowsByEvent, noteDrafts };
}

function getRequiredChapterRole(roleSlugs: Set<string>): RequiredAttendanceMember["chapterRole"] | null {
  if (roleSlugs.has("brother")) {
    return "brother";
  }

  if (roleSlugs.has("neophyte")) {
    return "neophyte";
  }

  return null;
}

function buildRequiredMembers(
  profileRows: RawProfileRow[],
  roleRows: RequiredMemberRoleRow[],
): RequiredAttendanceMember[] {
  const rolesByUser = new Map<string, Set<string>>();

  for (const row of roleRows) {
    const userId = toCleanString(row.user_id);
    const roleSlug = toCleanString(row.role_slug);

    if (!userId || !roleSlug) {
      continue;
    }

    rolesByUser.set(userId, new Set([...(rolesByUser.get(userId) ?? []), roleSlug]));
  }

  const members = profileRows
    .map(normalizeProfile)
    .filter((profile): profile is NonNullable<typeof profile> => profile !== null && profile.status === "active")
    .map((profile) => {
      const chapterRole = getRequiredChapterRole(rolesByUser.get(profile.user_id) ?? new Set());

      if (!chapterRole) {
        return null;
      }

      return {
        user_id: profile.user_id,
        name: profile.name,
        email: profile.email,
        chapterRole,
      };
    })
    .filter((member): member is RequiredAttendanceMember => member !== null);

  return sortRequiredAttendanceMembers(members);
}

function mergeAttendanceRows(
  current: AttendanceRowsByEvent,
  eventId: string,
  rows: EventAttendanceRow[],
): AttendanceRowsByEvent {
  const nextRowsForEvent = { ...(current[eventId] ?? {}) };

  for (const row of rows) {
    nextRowsForEvent[row.member_id] = row;
  }

  return {
    ...current,
    [eventId]: nextRowsForEvent,
  };
}

function formatRecordedAt(value: string | null | undefined) {
  return value ? formatEventDateTime(value) : "Not recorded";
}

function AttendanceTable({
  eventId,
  members,
  attendanceRows,
  noteDrafts,
  savingAttendanceKey,
  savingNoteKey,
  onStatusChange,
  onNoteChange,
  onSaveNote,
}: {
  eventId: string;
  members: RequiredAttendanceMember[];
  attendanceRows: Record<string, EventAttendanceRow>;
  noteDrafts: Record<string, string>;
  savingAttendanceKey: string | null;
  savingNoteKey: string | null;
  onStatusChange: (eventId: string, memberId: string, status: AttendanceStatus) => void;
  onNoteChange: (eventId: string, memberId: string, value: string) => void;
  onSaveNote: (eventId: string, memberId: string) => void;
}) {
  if (members.length === 0) {
    return (
      <EmptyState
        compact
        title="No required members"
        description="Active brothers and neophytes will appear here."
      />
    );
  }

  return (
    <Table minWidth={980} className="attendance-table">
      <TableHead>
        <TableRow>
          <TableHeaderCell>Member</TableHeaderCell>
          <TableHeaderCell>Type</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell>Note</TableHeaderCell>
          <TableHeaderCell>Recorded</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {members.map((member) => {
          const attendanceRow = attendanceRows[member.user_id] ?? null;
          const currentStatus = attendanceRow?.status ?? null;
          const key = getAttendanceKey(eventId, member.user_id);
          const noteDraft = noteDrafts[key] ?? attendanceRow?.notes ?? "";
          const isSavingAttendance = savingAttendanceKey === key;
          const isSavingNote = savingNoteKey === key;
          const noteChanged = noteDraft !== (attendanceRow?.notes ?? "");

          return (
            <TableRow key={member.user_id}>
              <TableCell>
                <div className="attendance-member">
                  <strong>{getRequiredMemberDisplayName(member)}</strong>
                  {member.email && <span>{member.email}</span>}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="info">{member.chapterRole}</Badge>
              </TableCell>
              <TableCell>
                <div className="attendance-status-cell">
                  <Badge variant={getStatusBadgeVariant(currentStatus)}>{getStatusLabel(currentStatus)}</Badge>
                  <div className="attendance-status-control" role="group" aria-label={`Attendance status for ${getRequiredMemberDisplayName(member)}`}>
                    {attendanceStatusOptions.map((option) => (
                      <button
                        key={option.status}
                        type="button"
                        className={`attendance-status-button${currentStatus === option.status ? " is-selected" : ""}`}
                        disabled={isSavingAttendance}
                        onClick={() => onStatusChange(eventId, member.user_id, option.status)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="attendance-note-control">
                  <input
                    className="form-control attendance-note-input"
                    value={noteDraft}
                    placeholder={attendanceRow ? "Optional note" : "Mark status first"}
                    disabled={!attendanceRow || isSavingNote}
                    aria-label={`Attendance note for ${getRequiredMemberDisplayName(member)}`}
                    onChange={(event) => onNoteChange(eventId, member.user_id, event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline-secondary"
                    size="sm"
                    disabled={!attendanceRow || !noteChanged || isSavingNote}
                    loading={isSavingNote}
                    onClick={() => onSaveNote(eventId, member.user_id)}
                  >
                    Save
                  </Button>
                </div>
              </TableCell>
              <TableCell>{formatRecordedAt(attendanceRow?.recorded_at)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default function HouseMeetingsTool({
  ownerLabel = "Recorder",
  returnPath = "/app/tools/rec",
}: HouseMeetingsToolProps = {}) {
  const { session } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const userId = session?.user?.id ?? null;
  const canManageMeetings = useMemo(() => canManageEventType(roles, "house_meeting"), [roles]);
  const canRecordAttendance = useMemo(() => canTakeHouseMeetingAttendance(roles), [roles]);

  const [events, setEvents] = useState<HouseMeetingEventRow[]>([]);
  const [requiredMembers, setRequiredMembers] = useState<RequiredAttendanceMember[]>([]);
  const [attendanceRowsByEvent, setAttendanceRowsByEvent] = useState<AttendanceRowsByEvent>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<HouseMeetingDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAttendanceKey, setSavingAttendanceKey] = useState<string | null>(null);
  const [savingNoteKey, setSavingNoteKey] = useState<string | null>(null);
  const [bulkSavingEventId, setBulkSavingEventId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadHouseMeetingData() {
      setLoading(true);
      setErrorMessage(null);

      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select(houseMeetingEventSelect)
        .eq("event_type", "house_meeting")
        .order("start", { ascending: true });

      if (ignore) {
        return;
      }

      if (eventError) {
        setEvents([]);
        setRequiredMembers([]);
        setAttendanceRowsByEvent({});
        setNoteDrafts({});
        setErrorMessage(dbError("load house meetings", eventError.message));
        setLoading(false);
        return;
      }

      const nextEvents = (eventData ?? []) as HouseMeetingEventRow[];
      setEvents(nextEvents);

      if (!canRecordAttendance) {
        setRequiredMembers([]);
        setAttendanceRowsByEvent({});
        setNoteDrafts({});
        setLoading(false);
        return;
      }

      const [profilesResult, attendanceResult] = await Promise.all([
        supabase
          .from("profiles")
          .select(PROFILE_COLUMNS)
          .eq("status", "active")
          .order("name", { ascending: true }),
        nextEvents.length > 0
          ? supabase
              .from("event_attendance")
              .select(attendanceSelect)
              .in(
                "event_id",
                nextEvents.map((meeting) => meeting.id),
              )
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (ignore) {
        return;
      }

      if (profilesResult.error) {
        setRequiredMembers([]);
        setAttendanceRowsByEvent({});
        setNoteDrafts({});
        setErrorMessage(dbError("load the attendance roster", profilesResult.error.message));
        setLoading(false);
        return;
      }

      const activeProfiles = (profilesResult.data ?? []) as RawProfileRow[];
      const activeProfileIds = activeProfiles
        .map((profile) => toCleanString(profile.user_id))
        .filter((profileId): profileId is string => profileId !== null);

      let requiredRoleRows: RequiredMemberRoleRow[] = [];

      if (activeProfileIds.length > 0) {
        const { data: roleData, error: roleError } = await supabase
          .from("user_roles")
          .select("user_id,role_slug")
          .in("user_id", activeProfileIds)
          .in("role_slug", ["brother", "neophyte"]);

        if (ignore) {
          return;
        }

        if (roleError) {
          setRequiredMembers([]);
          setAttendanceRowsByEvent({});
          setNoteDrafts({});
          setErrorMessage(dbError("load required member roles", roleError.message));
          setLoading(false);
          return;
        }

        requiredRoleRows = (roleData ?? []) as RequiredMemberRoleRow[];
      }

      if (attendanceResult.error) {
        setRequiredMembers([]);
        setAttendanceRowsByEvent({});
        setNoteDrafts({});
        setErrorMessage(dbError("load attendance", attendanceResult.error.message));
        setLoading(false);
        return;
      }

      const { rowsByEvent, noteDrafts: nextNoteDrafts } = normalizeAttendanceRowsByEvent(
        (attendanceResult.data ?? []) as Record<string, unknown>[],
      );

      setRequiredMembers(buildRequiredMembers(activeProfiles, requiredRoleRows));
      setAttendanceRowsByEvent(rowsByEvent);
      setNoteDrafts(nextNoteDrafts);
      setLoading(false);
    }

    if (rolesLoading) {
      return () => {
        ignore = true;
      };
    }

    const timeoutId = window.setTimeout(() => {
      if (canManageMeetings) {
        void loadHouseMeetingData();
      } else {
        setLoading(false);
      }
    }, 0);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [canManageMeetings, canRecordAttendance, rolesLoading]);

  function resetDraft() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  function beginEdit(meeting: HouseMeetingEventRow) {
    setEditingId(meeting.id);
    setDraft({
      title: meeting.title,
      description: meeting.description ?? "",
      start: toEventDateTimeInputValue(meeting.start),
      end: toEventDateTimeInputValue(meeting.end),
    });
  }

  const canEditOrDeleteEvent = (meeting: HouseMeetingEventRow) => {
    return canManageEvent(roles, meeting.created_by, userId, meeting.event_type);
  };

  async function handleSaveMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageMeetings || !userId) {
      setErrorMessage("You do not have permission to save house meetings.");
      return;
    }

    if (!draft.title.trim() || !draft.start || !draft.end) {
      setErrorMessage("Title, start, and end are required.");
      return;
    }

    if (!isEventEndAfterStart(draft.start, draft.end)) {
      setErrorMessage("End date/time must be after start date/time.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    const meetingPayload = {
      title: draft.title.trim(),
      description: cleanNote(draft.description),
      event_type: "house_meeting",
      event_tags: ["house_meeting"],
      start: toEventTimestamp(draft.start),
      end: toEventTimestamp(draft.end),
      visible_to_alum: false,
      visible_to_neophyte: true,
    };

    if (editingId) {
      const existing = events.find((meeting) => meeting.id === editingId);
      if (!existing || !canEditOrDeleteEvent(existing)) {
        setErrorMessage("You do not have permission to update this house meeting.");
        setSaving(false);
        return;
      }

      const { data, error } = await supabase
        .from("events")
        .update(meetingPayload)
        .eq("id", editingId)
        .select(houseMeetingEventSelect)
        .single();

      if (error) {
        setErrorMessage(dbError("update this house meeting", error.message));
      } else if (data) {
        setEvents((current) =>
          current.map((meeting) => (meeting.id === data.id ? (data as HouseMeetingEventRow) : meeting))
        );
        resetDraft();
      }
    } else {
      const { data, error } = await supabase
        .from("events")
        .insert({
          ...meetingPayload,
          created_by: userId,
          details: {},
        })
        .select(houseMeetingEventSelect)
        .single();

      if (error) {
        setErrorMessage(dbError("create this house meeting", error.message));
      } else if (data) {
        setEvents((current) =>
          [...current, data as HouseMeetingEventRow].sort((a, b) =>
            compareEventDateTimes(a.start, b.start)
          )
        );
        resetDraft();
      }
    }

    setSaving(false);
  }

  async function deleteMeeting(meetingId: string) {
    const target = events.find((meeting) => meeting.id === meetingId);

    if (!target || !canEditOrDeleteEvent(target)) {
      setErrorMessage("You do not have permission to delete this house meeting.");
      return;
    }

    setErrorMessage(null);

    const { error } = await supabase.from("events").delete().eq("id", meetingId);
    if (error) {
      setErrorMessage(dbError("delete this house meeting", error.message));
      return;
    }

    setEvents((current) => current.filter((meeting) => meeting.id !== meetingId));
    setAttendanceRowsByEvent((current) => {
      const remaining = { ...current };
      delete remaining[meetingId];
      return remaining;
    });
  }

  function updateAttendanceRow(row: EventAttendanceRow) {
    setAttendanceRowsByEvent((current) => mergeAttendanceRows(current, row.event_id, [row]));
    setNoteDrafts((current) => ({
      ...current,
      [getAttendanceKey(row.event_id, row.member_id)]: row.notes ?? "",
    }));
  }

  async function setAttendanceStatus(eventId: string, memberId: string, status: AttendanceStatus) {
    if (!canRecordAttendance || !userId) {
      setErrorMessage("Only Recorder role accounts can save house meeting attendance.");
      return;
    }

    const key = getAttendanceKey(eventId, memberId);
    const existing = attendanceRowsByEvent[eventId]?.[memberId];

    setSavingAttendanceKey(key);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("event_attendance")
      .upsert(
        {
          event_id: eventId,
          member_id: memberId,
          status,
          notes: cleanNote(noteDrafts[key] ?? existing?.notes ?? ""),
          recorded_by: userId,
          recorded_at: new Date().toISOString(),
        },
        { onConflict: "event_id,member_id" },
      )
      .select(attendanceSelect)
      .single();

    if (error) {
      setErrorMessage(dbError("save attendance", error.message));
    } else {
      const attendanceRow = normalizeAttendanceRow(data as Record<string, unknown>);
      if (attendanceRow) {
        updateAttendanceRow(attendanceRow);
      }
    }

    setSavingAttendanceKey(null);
  }

  function setAttendanceNoteDraft(eventId: string, memberId: string, value: string) {
    setNoteDrafts((current) => ({
      ...current,
      [getAttendanceKey(eventId, memberId)]: value,
    }));
  }

  async function saveAttendanceNote(eventId: string, memberId: string) {
    if (!canRecordAttendance || !userId) {
      setErrorMessage("Only Recorder role accounts can save house meeting attendance.");
      return;
    }

    const existing = attendanceRowsByEvent[eventId]?.[memberId];
    if (!existing) {
      setErrorMessage("Choose an attendance status before saving a note.");
      return;
    }

    const key = getAttendanceKey(eventId, memberId);
    setSavingNoteKey(key);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("event_attendance")
      .update({
        notes: cleanNote(noteDrafts[key] ?? ""),
        recorded_by: userId,
        recorded_at: new Date().toISOString(),
      })
      .eq("event_id", eventId)
      .eq("member_id", memberId)
      .select(attendanceSelect)
      .single();

    if (error) {
      setErrorMessage(dbError("save attendance note", error.message));
    } else {
      const attendanceRow = normalizeAttendanceRow(data as Record<string, unknown>);
      if (attendanceRow) {
        updateAttendanceRow(attendanceRow);
      }
    }

    setSavingNoteKey(null);
  }

  async function markUnrecordedAbsent(eventId: string) {
    if (!canRecordAttendance || !userId) {
      setErrorMessage("Only Recorder role accounts can save house meeting attendance.");
      return;
    }

    const attendanceRows = attendanceRowsByEvent[eventId] ?? {};
    const unrecordedMembers = requiredMembers.filter((member) => !attendanceRows[member.user_id]);

    if (unrecordedMembers.length === 0) {
      return;
    }

    setBulkSavingEventId(eventId);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("event_attendance")
      .upsert(
        unrecordedMembers.map((member) => {
          const key = getAttendanceKey(eventId, member.user_id);

          return {
            event_id: eventId,
            member_id: member.user_id,
            status: "absent",
            notes: cleanNote(noteDrafts[key] ?? ""),
            recorded_by: userId,
            recorded_at: new Date().toISOString(),
          };
        }),
        { onConflict: "event_id,member_id" },
      )
      .select(attendanceSelect);

    if (error) {
      setErrorMessage(dbError("mark unrecorded members absent", error.message));
    } else {
      const attendanceRowsToMerge = ((data ?? []) as Record<string, unknown>[])
        .map(normalizeAttendanceRow)
        .filter((row): row is EventAttendanceRow => row !== null);

      setAttendanceRowsByEvent((current) => mergeAttendanceRows(current, eventId, attendanceRowsToMerge));
      setNoteDrafts((current) => {
        const nextDrafts = { ...current };

        for (const row of attendanceRowsToMerge) {
          nextDrafts[getAttendanceKey(row.event_id, row.member_id)] = row.notes ?? "";
        }

        return nextDrafts;
      });
    }

    setBulkSavingEventId(null);
  }

  if (!rolesLoading && !canManageMeetings) {
    return <Navigate to={returnPath} replace />;
  }

  return (
    <Card className="tools-page house-meeting-tool">
      <PageHeader
        eyebrow={ownerLabel}
        title="House Meetings"
        subtitle="Create house meeting calendar events and record required attendance."
        bordered
        actions={<Button to={returnPath} variant="outline-secondary">{ownerLabel} Tools</Button>}
      />

      <form className="party-tool-form" onSubmit={handleSaveMeeting}>
        <SectionHeader
          size="sm"
          title={editingId ? "Update house meeting" : "Create house meeting"}
          description="House meetings are visible to brothers and neophytes."
        />

        <div className="budget-form-grid">
          <Input
            className="budget-form-full"
            label="Meeting title"
            placeholder="Meeting title"
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
            {editingId ? "Save changes" : "Create meeting"}
          </Button>
          {editingId && (
            <Button type="button" variant="outline-secondary" onClick={resetDraft}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      {loading && <p className="announcements-state">Loading house meetings...</p>}
      {errorMessage && <p className="mt-4 text-danger">{errorMessage}</p>}

      {!loading && events.length === 0 && (
        <EmptyState
          title="No house meetings"
          description="House meetings created from this tool will appear here."
        />
      )}

      {!loading && events.length > 0 && (
        <div className="party-event-list">
          {events.map((meeting) => {
            const attendanceRows = attendanceRowsByEvent[meeting.id] ?? {};
            const summary = calculateAttendanceSummary(requiredMembers, attendanceRows);
            const isBulkSaving = bulkSavingEventId === meeting.id;

            return (
              <article key={meeting.id} className="party-event-card house-meeting-card">
                <div className="party-event-summary">
                  <div>
                    <EventTagBadges eventTags={meeting.event_tags} eventType="house_meeting" />
                    <h3>{meeting.title}</h3>
                    <p>{formatEventDateTime(meeting.start)} to {formatEventDateTime(meeting.end)}</p>
                  </div>
                  {canEditOrDeleteEvent(meeting) && (
                    <div className="d-flex gap-2 flex-wrap">
                      <Button type="button" variant="outline-secondary" size="sm" onClick={() => beginEdit(meeting)}>
                        Edit
                      </Button>
                      <Button type="button" variant="danger" size="sm" onClick={() => void deleteMeeting(meeting.id)}>
                        Delete
                      </Button>
                    </div>
                  )}
                </div>

                <p className="house-meeting-description">
                  {meeting.description || "No description provided."}
                </p>

                {canRecordAttendance && (
                  <section className="attendance-panel">
                    <SectionHeader
                      className="mt-0"
                      size="sm"
                      title="Attendance"
                      description="Required roster: active brothers and neophytes."
                      actions={
                        summary.unmarked > 0 ? (
                          <Button
                            type="button"
                            variant="outline-secondary"
                            size="sm"
                            loading={isBulkSaving}
                            disabled={isBulkSaving}
                            onClick={() => void markUnrecordedAbsent(meeting.id)}
                          >
                            Mark unrecorded absent
                          </Button>
                        ) : undefined
                      }
                    />

                    <div className="attendance-metric-grid">
                      <MetricCard label="Required" value={summary.required} detail="brothers and neophytes" tone="info" />
                      <MetricCard label="Present" value={summary.present} detail="recorded present" tone="success" />
                      <MetricCard label="Excused" value={summary.excused} detail="excused absences" tone="warning" />
                      <MetricCard label="Absent" value={summary.absent} detail={`${summary.unmarked} unmarked`} tone={summary.absent > 0 ? "danger" : "default"} />
                    </div>

                    <AttendanceTable
                      eventId={meeting.id}
                      members={requiredMembers}
                      attendanceRows={attendanceRows}
                      noteDrafts={noteDrafts}
                      savingAttendanceKey={savingAttendanceKey}
                      savingNoteKey={savingNoteKey}
                      onStatusChange={(eventId, memberId, status) => void setAttendanceStatus(eventId, memberId, status)}
                      onNoteChange={setAttendanceNoteDraft}
                      onSaveNote={(eventId, memberId) => void saveAttendanceNote(eventId, memberId)}
                    />
                  </section>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}

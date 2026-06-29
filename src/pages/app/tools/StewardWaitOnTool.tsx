import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../../auth/authContext";
import { canManageWaitOns } from "../../../auth/roleAccess";
import useRoles from "../../../auth/useRoles";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  SectionHeader,
  Select,
} from "../../../components/ui";
import {
  addWaitOnAssignment,
  ensureWaitOnScheduleForWeek,
  getActiveBrotherOptions,
  getWaitOnScheduleForWeek,
  removeWaitOnAssignment,
  setWaitOnSchedulePublished,
} from "../../../lib/waitOnQueries";
import {
  formatWaitOnSlotDate,
  formatWeekRange,
  getCurrentWeekStartValue,
  normalizeWeekStartInput,
  waitOnSlots,
  type BrotherOption,
  type WaitOnAssignment,
  type WaitOnSchedule,
  type WaitOnSlotKey,
} from "../../../lib/waitOns";

type StewardWaitOnToolProps = {
  ownerLabel: string;
  returnPath: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function getBrotherName(brother: BrotherOption | WaitOnAssignment) {
  if ("user_id" in brother) {
    return brother.name ?? brother.email ?? "Brother";
  }

  return brother.brotherName ?? brother.brotherEmail ?? "Brother";
}

function buildAssignmentsBySlot(assignments: WaitOnAssignment[]) {
  return waitOnSlots.reduce<Record<WaitOnSlotKey, WaitOnAssignment[]>>((lookup, slot) => {
    lookup[slot.key] = assignments.filter((assignment) => assignment.slot_key === slot.key);
    return lookup;
  }, {} as Record<WaitOnSlotKey, WaitOnAssignment[]>);
}

export default function StewardWaitOnTool({ ownerLabel, returnPath }: StewardWaitOnToolProps) {
  const { session } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const canManage = useMemo(() => canManageWaitOns(roles), [roles]);
  const userId = session?.user?.id ?? null;

  const [weekStart, setWeekStart] = useState(getCurrentWeekStartValue());
  const [schedule, setSchedule] = useState<WaitOnSchedule | null>(null);
  const [assignments, setAssignments] = useState<WaitOnAssignment[]>([]);
  const [brothers, setBrothers] = useState<BrotherOption[]>([]);
  const [selectedBrotherBySlot, setSelectedBrotherBySlot] = useState<Partial<Record<WaitOnSlotKey, string>>>({});
  const [loading, setLoading] = useState(true);
  const [addingSlot, setAddingSlot] = useState<WaitOnSlotKey | null>(null);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const assignmentsBySlot = useMemo(() => buildAssignmentsBySlot(assignments), [assignments]);
  const publishedFormPath = `/app/wait-ons?week=${weekStart}`;
  const totalAssignments = assignments.length;

  useEffect(() => {
    let ignore = false;

    async function loadWaitOns() {
      if (!userId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      setNoticeMessage(null);

      try {
        await ensureWaitOnScheduleForWeek(weekStart, userId);
        const [scheduleData, brotherOptions] = await Promise.all([
          getWaitOnScheduleForWeek(weekStart),
          getActiveBrotherOptions(),
        ]);

        if (!ignore) {
          setSchedule(scheduleData.schedule);
          setAssignments(scheduleData.assignments);
          setBrothers(brotherOptions);
        }
      } catch (error) {
        if (!ignore) {
          setSchedule(null);
          setAssignments([]);
          setBrothers([]);
          setErrorMessage(`Could not load the wait-on schedule: ${getErrorMessage(error)}`);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    if (rolesLoading) {
      return () => {
        ignore = true;
      };
    }

    if (!canManage) {
      setLoading(false);
      return () => {
        ignore = true;
      };
    }

    void loadWaitOns();

    return () => {
      ignore = true;
    };
  }, [canManage, rolesLoading, userId, weekStart]);

  async function refreshSchedule() {
    setLoading(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      const [scheduleData, brotherOptions] = await Promise.all([
        getWaitOnScheduleForWeek(weekStart),
        getActiveBrotherOptions(),
      ]);
      setSchedule(scheduleData.schedule);
      setAssignments(scheduleData.assignments);
      setBrothers(brotherOptions);
    } catch (error) {
      setErrorMessage(`Could not refresh the wait-on schedule: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleTogglePublished() {
    if (!schedule) {
      setErrorMessage("The weekly wait-on schedule is not ready yet.");
      return;
    }

    setPublishing(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      const nextSchedule = await setWaitOnSchedulePublished(schedule.id, !schedule.published);
      setSchedule(nextSchedule);
      setNoticeMessage(nextSchedule.published ? "Wait-on form published." : "Wait-on form moved back to draft.");
    } catch (error) {
      setErrorMessage(`Could not update publish status: ${getErrorMessage(error)}`);
    } finally {
      setPublishing(false);
    }
  }

  async function handleAddAssignment(slotKey: WaitOnSlotKey) {
    const brotherId = selectedBrotherBySlot[slotKey] ?? "";
    if (!schedule || !brotherId) {
      setErrorMessage("Choose a brother before adding them to a wait-on slot.");
      return;
    }

    if (assignments.some((assignment) => assignment.slot_key === slotKey && assignment.brother_id === brotherId)) {
      setErrorMessage("That brother is already assigned to this slot.");
      return;
    }

    setAddingSlot(slotKey);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      const nextAssignment = await addWaitOnAssignment(schedule.id, slotKey, brotherId);
      setAssignments((current) => [...current, nextAssignment].sort((a, b) => {
        const slotComparison = waitOnSlots.findIndex((slot) => slot.key === a.slot_key) - waitOnSlots.findIndex((slot) => slot.key === b.slot_key);
        return slotComparison !== 0 ? slotComparison : getBrotherName(a).localeCompare(getBrotherName(b));
      }));
      setSelectedBrotherBySlot((current) => ({ ...current, [slotKey]: "" }));
      setNoticeMessage(`${getBrotherName(nextAssignment)} added.`);
    } catch (error) {
      setErrorMessage(`Could not add that brother: ${getErrorMessage(error)}`);
    } finally {
      setAddingSlot(null);
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    setRemovingAssignmentId(assignmentId);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      await removeWaitOnAssignment(assignmentId);
      setAssignments((current) => current.filter((assignment) => assignment.id !== assignmentId));
      setNoticeMessage("Wait-on assignment removed.");
    } catch (error) {
      setErrorMessage(`Could not remove that assignment: ${getErrorMessage(error)}`);
    } finally {
      setRemovingAssignmentId(null);
    }
  }

  if (!rolesLoading && !canManage) {
    return <Navigate to="/app/tools" replace />;
  }

  return (
    <Card className="tools-page">
      <PageHeader
        eyebrow={ownerLabel}
        title="Wait-on Scheduler"
        subtitle="Build and publish weekly meal, mop, and Sunday wait-on assignments."
        bordered
        actions={<Button to={returnPath} variant="outline-secondary">Steward Tools</Button>}
      />

      <div className="wait-on-toolbar">
        <Input
          label="Week of"
          type="date"
          value={weekStart}
          onChange={(event) => setWeekStart(normalizeWeekStartInput(event.target.value))}
          disabled={loading || publishing}
        />
        <div className="wait-on-status-strip">
          <Badge variant={schedule?.published ? "success" : "warning"}>
            {schedule?.published ? "Published" : "Draft"}
          </Badge>
          <span>{formatWeekRange(weekStart)}</span>
          <span>{totalAssignments} assignment{totalAssignments === 1 ? "" : "s"}</span>
        </div>
        <div className="wait-on-toolbar-actions">
          <Button type="button" variant="outline-secondary" onClick={() => void refreshSchedule()} disabled={loading}>
            Refresh
          </Button>
          <Button type="button" variant={schedule?.published ? "outline-secondary" : "outline-gold"} loading={publishing} disabled={loading || !schedule} onClick={() => void handleTogglePublished()}>
            {schedule?.published ? "Unpublish" : "Publish"}
          </Button>
          <Button to={publishedFormPath} variant="outline-secondary">
            View form
          </Button>
        </div>
      </div>

      {loading && <p className="announcements-state">Loading wait-ons...</p>}
      {errorMessage && <div className="alert alert-danger mt-3 mb-0">{errorMessage}</div>}
      {noticeMessage && <div className="alert alert-success mt-3 mb-0">{noticeMessage}</div>}

      {!loading && brothers.length === 0 && (
        <EmptyState
          title="No active brothers found"
          description="Active brothers with the Brother role will appear here when the directory data is available."
        />
      )}

      {!loading && (
        <>
          <SectionHeader
            title="Weekly slots"
            description="No Friday dinner slot is included."
          />

          <div className="wait-on-slot-grid">
            {waitOnSlots.map((slot) => {
              const slotAssignments = assignmentsBySlot[slot.key];
              const selectedBrotherId = selectedBrotherBySlot[slot.key] ?? "";
              const addingThisSlot = addingSlot === slot.key;

              return (
                <article className="wait-on-slot-card" key={slot.key}>
                  <div className="wait-on-slot-header">
                    <div>
                      <Badge variant="neutral">{slot.day}</Badge>
                      <h3>{slot.service}</h3>
                      <p>{formatWaitOnSlotDate(weekStart, slot)}</p>
                    </div>
                    <Badge variant={slotAssignments.length > 0 ? "info" : "neutral"}>
                      {slotAssignments.length} assigned
                    </Badge>
                  </div>

                  {slotAssignments.length === 0 ? (
                    <p className="wait-on-empty">No brothers assigned.</p>
                  ) : (
                    <div className="wait-on-assignment-list">
                      {slotAssignments.map((assignment) => (
                        <div className="wait-on-assignment-row" key={assignment.id}>
                          <div>
                            <span className="wait-on-assignment-name">{getBrotherName(assignment)}</span>
                            {assignment.brotherEmail && (
                              <span className="wait-on-assignment-email">{assignment.brotherEmail}</span>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={removingAssignmentId === assignment.id}
                            onClick={() => void handleRemoveAssignment(assignment.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <form
                    className="wait-on-add-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleAddAssignment(slot.key);
                    }}
                  >
                    <Select
                      label="Brother"
                      value={selectedBrotherId}
                      onChange={(event) =>
                        setSelectedBrotherBySlot((current) => ({
                          ...current,
                          [slot.key]: event.target.value,
                        }))
                      }
                      disabled={brothers.length === 0 || addingThisSlot}
                    >
                      <option value="">Select brother</option>
                      {brothers.map((brother) => (
                        <option key={brother.user_id} value={brother.user_id}>
                          {getBrotherName(brother)}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" variant="outline-secondary" loading={addingThisSlot} disabled={!selectedBrotherId || addingThisSlot}>
                      Add
                    </Button>
                  </form>
                </article>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

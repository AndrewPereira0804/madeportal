import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Input, PageHeader, SectionHeader } from "../../components/ui";
import { getPublishedWaitOnScheduleForWeek } from "../../lib/waitOnQueries";
import {
  formatWaitOnSlotDate,
  formatWeekRange,
  getCurrentWeekStartValue,
  normalizeWeekStartInput,
  waitOnSlots,
  type WaitOnAssignment,
  type WaitOnSchedule as WaitOnScheduleRow,
  type WaitOnSlotKey,
} from "../../lib/waitOns";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function getAssignmentName(assignment: WaitOnAssignment) {
  return assignment.brotherName ?? assignment.brotherEmail ?? "Brother";
}

function buildAssignmentsBySlot(assignments: WaitOnAssignment[]) {
  return waitOnSlots.reduce<Record<WaitOnSlotKey, WaitOnAssignment[]>>((lookup, slot) => {
    lookup[slot.key] = assignments.filter((assignment) => assignment.slot_key === slot.key);
    return lookup;
  }, {} as Record<WaitOnSlotKey, WaitOnAssignment[]>);
}

export default function WaitOnSchedule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialWeekStart = normalizeWeekStartInput(searchParams.get("week") ?? getCurrentWeekStartValue());

  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [schedule, setSchedule] = useState<WaitOnScheduleRow | null>(null);
  const [assignments, setAssignments] = useState<WaitOnAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const assignmentsBySlot = useMemo(() => buildAssignmentsBySlot(assignments), [assignments]);

  useEffect(() => {
    const nextWeekStart = normalizeWeekStartInput(searchParams.get("week") ?? getCurrentWeekStartValue());
    setWeekStart(nextWeekStart);
  }, [searchParams]);

  useEffect(() => {
    let ignore = false;

    async function loadPublishedWaitOns() {
      setLoading(true);
      setErrorMessage(null);

      try {
        const scheduleData = await getPublishedWaitOnScheduleForWeek(weekStart);
        if (!ignore) {
          setSchedule(scheduleData.schedule);
          setAssignments(scheduleData.assignments);
        }
      } catch (error) {
        if (!ignore) {
          setSchedule(null);
          setAssignments([]);
          setErrorMessage(`Could not load the published wait-on form: ${getErrorMessage(error)}`);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadPublishedWaitOns();

    return () => {
      ignore = true;
    };
  }, [weekStart]);

  function handleWeekChange(value: string) {
    const normalized = normalizeWeekStartInput(value);
    setWeekStart(normalized);
    setSearchParams({ week: normalized });
  }

  return (
    <Card className="wait-on-form-page">
      <PageHeader
        eyebrow="Wait-ons"
        title="Published Wait-on Form"
        subtitle={formatWeekRange(weekStart)}
        bordered
        actions={<Button to="/app" variant="outline-secondary">Dashboard</Button>}
      />

      <div className="wait-on-toolbar">
        <Input
          label="Week of"
          type="date"
          value={weekStart}
          onChange={(event) => handleWeekChange(event.target.value)}
          disabled={loading}
        />
        <div className="wait-on-status-strip">
          <Badge variant={schedule ? "success" : "neutral"}>
            {schedule ? "Published" : "No published form"}
          </Badge>
          <span>{assignments.length} assignment{assignments.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      {loading && <p className="announcements-state">Loading wait-on form...</p>}
      {errorMessage && <div className="alert alert-danger mt-3 mb-0">{errorMessage}</div>}

      {!loading && !schedule && (
        <EmptyState
          title="No published wait-on form"
          description="The steward has not published a wait-on form for this week."
        />
      )}

      {!loading && schedule && (
        <>
          <SectionHeader title="Weekly wait-ons" description="Published assignments by slot." />
          <div className="wait-on-slot-grid wait-on-slot-grid--published">
            {waitOnSlots.map((slot) => {
              const slotAssignments = assignmentsBySlot[slot.key];

              return (
                <article className="wait-on-slot-card" key={slot.key}>
                  <div className="wait-on-slot-header">
                    <div>
                      <Badge variant="neutral">{slot.day}</Badge>
                      <h3>{slot.service}</h3>
                      <p>{formatWaitOnSlotDate(weekStart, slot)}</p>
                    </div>
                    <Badge variant={slotAssignments.length > 0 ? "info" : "neutral"}>
                      {slotAssignments.length}
                    </Badge>
                  </div>

                  {slotAssignments.length === 0 ? (
                    <p className="wait-on-empty">No brothers assigned.</p>
                  ) : (
                    <div className="wait-on-assignment-list">
                      {slotAssignments.map((assignment) => (
                        <div className="wait-on-assignment-row wait-on-assignment-row--published" key={assignment.id}>
                          <span className="wait-on-assignment-name">{getAssignmentName(assignment)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

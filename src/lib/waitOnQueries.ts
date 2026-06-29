import supabase from "../config/supabaseClient";
import {
  compareWaitOnAssignments,
  waitOnSlotOrder,
  type BrotherOption,
  type WaitOnAssignment,
  type WaitOnSchedule,
  type WaitOnScheduleWithAssignments,
  type WaitOnSlotKey,
} from "./waitOns";

type RawRow = Record<string, unknown>;

const waitOnScheduleColumns = "id, week_start, published, created_by, created_at, updated_at";
const waitOnAssignmentColumns = "id, schedule_id, slot_key, brother_id, created_at";

function toStringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toRequiredString(value: unknown, fieldName: string) {
  const cleaned = toStringOrNull(value);
  if (!cleaned) {
    throw new Error(`Wait-on data is missing ${fieldName}.`);
  }

  return cleaned;
}

function toBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function normalizeWaitOnSchedule(row: RawRow): WaitOnSchedule {
  return {
    id: toRequiredString(row.id, "a schedule identifier"),
    week_start: toRequiredString(row.week_start, "a week start"),
    published: toBoolean(row.published),
    created_by: toStringOrNull(row.created_by),
    created_at: toStringOrNull(row.created_at),
    updated_at: toStringOrNull(row.updated_at),
  };
}

function normalizeBrotherOption(row: RawRow): BrotherOption {
  return {
    user_id: toRequiredString(row.user_id, "a brother identifier"),
    name: toStringOrNull(row.name),
    email: toStringOrNull(row.email),
  };
}

function normalizeWaitOnAssignment(
  row: RawRow,
  brothersById: Map<string, BrotherOption>,
): WaitOnAssignment {
  const brotherId = toRequiredString(row.brother_id, "a brother identifier");
  const brother = brothersById.get(brotherId);

  return {
    id: toRequiredString(row.id, "an assignment identifier"),
    schedule_id: toRequiredString(row.schedule_id, "a schedule identifier"),
    slot_key: toRequiredString(row.slot_key, "a slot key") as WaitOnSlotKey,
    brother_id: brotherId,
    created_at: toStringOrNull(row.created_at),
    brotherName: brother?.name ?? null,
    brotherEmail: brother?.email ?? null,
  };
}

function getBrotherSortValue(brother: BrotherOption) {
  return (brother.name ?? brother.email ?? "").toLowerCase();
}

async function getProfilesByIds(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, BrotherOption>();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id,name,email")
    .in("user_id", userIds);

  if (error) {
    throw error;
  }

  return new Map(
    ((data ?? []) as RawRow[])
      .map(normalizeBrotherOption)
      .map((brother) => [brother.user_id, brother])
  );
}

export async function getActiveBrotherOptions() {
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("user_id,name,email")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (profileError) {
    throw profileError;
  }

  const activeProfiles = ((profileData ?? []) as RawRow[]).map(normalizeBrotherOption);
  if (activeProfiles.length === 0) {
    return [];
  }

  const { data: roleData, error: roleError } = await supabase
    .from("user_roles")
    .select("user_id,role_slug")
    .eq("role_slug", "brother")
    .in(
      "user_id",
      activeProfiles.map((profile) => profile.user_id),
    );

  if (roleError) {
    throw roleError;
  }

  const brotherIds = new Set(
    ((roleData ?? []) as RawRow[])
      .map((row) => toStringOrNull(row.user_id))
      .filter((userId): userId is string => Boolean(userId))
  );

  return activeProfiles
    .filter((profile) => brotherIds.has(profile.user_id))
    .sort((a, b) => getBrotherSortValue(a).localeCompare(getBrotherSortValue(b)));
}

export async function getWaitOnAssignmentsForSchedule(scheduleId: string) {
  const { data, error } = await supabase
    .from("wait_on_assignments")
    .select(waitOnAssignmentColumns)
    .eq("schedule_id", scheduleId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as RawRow[];
  const brothersById = await getProfilesByIds(
    Array.from(
      new Set(
        rows
          .map((row) => toStringOrNull(row.brother_id))
          .filter((userId): userId is string => Boolean(userId))
      )
    )
  );

  return rows
    .map((row) => normalizeWaitOnAssignment(row, brothersById))
    .sort(compareWaitOnAssignments);
}

export async function getWaitOnScheduleForWeek(weekStart: string): Promise<WaitOnScheduleWithAssignments> {
  const { data, error } = await supabase
    .from("wait_on_schedules")
    .select(waitOnScheduleColumns)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return { schedule: null, assignments: [] };
  }

  const schedule = normalizeWaitOnSchedule(data as RawRow);
  return {
    schedule,
    assignments: await getWaitOnAssignmentsForSchedule(schedule.id),
  };
}

export async function getPublishedWaitOnScheduleForWeek(weekStart: string): Promise<WaitOnScheduleWithAssignments> {
  const { data, error } = await supabase
    .from("wait_on_schedules")
    .select(waitOnScheduleColumns)
    .eq("week_start", weekStart)
    .eq("published", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return { schedule: null, assignments: [] };
  }

  const schedule = normalizeWaitOnSchedule(data as RawRow);
  return {
    schedule,
    assignments: await getWaitOnAssignmentsForSchedule(schedule.id),
  };
}

export async function ensureWaitOnScheduleForWeek(weekStart: string, createdBy: string) {
  const { error } = await supabase
    .from("wait_on_schedules")
    .upsert(
      { week_start: weekStart, created_by: createdBy },
      { onConflict: "week_start", ignoreDuplicates: true },
    );

  if (error) {
    throw error;
  }

  const { schedule } = await getWaitOnScheduleForWeek(weekStart);
  if (!schedule) {
    throw new Error("Wait-on schedule could not be created.");
  }

  return schedule;
}

export async function setWaitOnSchedulePublished(scheduleId: string, published: boolean) {
  const { data, error } = await supabase
    .from("wait_on_schedules")
    .update({ published })
    .eq("id", scheduleId)
    .select(waitOnScheduleColumns)
    .single();

  if (error) {
    throw error;
  }

  return normalizeWaitOnSchedule(data as RawRow);
}

export async function addWaitOnAssignment(scheduleId: string, slotKey: WaitOnSlotKey, brotherId: string) {
  const { data, error } = await supabase
    .from("wait_on_assignments")
    .insert({
      schedule_id: scheduleId,
      slot_key: slotKey,
      brother_id: brotherId,
    })
    .select(waitOnAssignmentColumns)
    .single();

  if (error) {
    throw error;
  }

  const brothersById = await getProfilesByIds([brotherId]);
  return normalizeWaitOnAssignment(data as RawRow, brothersById);
}

export async function removeWaitOnAssignment(assignmentId: string) {
  const { count, error } = await supabase
    .from("wait_on_assignments")
    .delete({ count: "exact" })
    .eq("id", assignmentId);

  if (error) {
    throw error;
  }

  if (count === 0) {
    throw new Error("That wait-on assignment was not found.");
  }
}

export async function getPublishedWaitOnsForUserWeek(userId: string, weekStart: string) {
  const { schedule } = await getPublishedWaitOnScheduleForWeek(weekStart);
  if (!schedule) {
    return [];
  }

  const { data, error } = await supabase
    .from("wait_on_assignments")
    .select(waitOnAssignmentColumns)
    .eq("schedule_id", schedule.id)
    .eq("brother_id", userId);

  if (error) {
    throw error;
  }

  const brothersById = await getProfilesByIds([userId]);
  return ((data ?? []) as RawRow[])
    .map((row) => normalizeWaitOnAssignment(row, brothersById))
    .sort((a, b) => (waitOnSlotOrder.get(a.slot_key) ?? 999) - (waitOnSlotOrder.get(b.slot_key) ?? 999));
}

import { profileSortValue, toCleanString, type ProfileRow } from "../pages/app/profileTypes";

export type AttendanceStatus = "present" | "excused" | "absent";

export type EventAttendanceRow = {
  id: string;
  event_id: string;
  member_id: string;
  status: AttendanceStatus;
  notes: string | null;
  recorded_by: string | null;
  recorded_at: string;
  created_at: string;
  updated_at: string;
};

export type RequiredAttendanceMember = Pick<ProfileRow, "user_id" | "name" | "email"> & {
  chapterRole: "brother" | "neophyte";
};

export type AttendanceSummary = {
  required: number;
  present: number;
  excused: number;
  absent: number;
  unmarked: number;
};

export const attendanceStatusOptions: { status: AttendanceStatus; label: string }[] = [
  { status: "present", label: "Present" },
  { status: "excused", label: "Excused" },
  { status: "absent", label: "Absent" },
];

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return value === "present" || value === "excused" || value === "absent";
}

export function normalizeAttendanceRow(row: Record<string, unknown> | null | undefined): EventAttendanceRow | null {
  const id = toCleanString(row?.id);
  const eventId = toCleanString(row?.event_id);
  const memberId = toCleanString(row?.member_id);
  const recordedAt = toCleanString(row?.recorded_at);
  const createdAt = toCleanString(row?.created_at);
  const updatedAt = toCleanString(row?.updated_at);
  const status = row?.status;

  if (!id || !eventId || !memberId || !isAttendanceStatus(status) || !recordedAt || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    event_id: eventId,
    member_id: memberId,
    status,
    notes: toCleanString(row?.notes),
    recorded_by: toCleanString(row?.recorded_by),
    recorded_at: recordedAt,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export function getAttendanceKey(eventId: string, memberId: string) {
  return `${eventId}:${memberId}`;
}

export function getRequiredMemberDisplayName(member: RequiredAttendanceMember) {
  return member.name ?? member.email ?? "No info provided";
}

function profileSortKey(member: RequiredAttendanceMember) {
  return profileSortValue({
    user_id: member.user_id,
    name: member.name,
    email: member.email,
    status: "active",
    created_at: null,
    phone: null,
    grad_year: null,
    major: null,
    hometown: null,
  });
}

export function sortRequiredAttendanceMembers(members: RequiredAttendanceMember[]) {
  return [...members].sort((left, right) => profileSortKey(left).localeCompare(profileSortKey(right)));
}

export function calculateAttendanceSummary(
  members: RequiredAttendanceMember[],
  attendanceRowsByMemberId: Record<string, EventAttendanceRow>,
): AttendanceSummary {
  const summary: AttendanceSummary = {
    required: members.length,
    present: 0,
    excused: 0,
    absent: 0,
    unmarked: 0,
  };

  for (const member of members) {
    const attendanceRow = attendanceRowsByMemberId[member.user_id];

    if (!attendanceRow) {
      summary.unmarked += 1;
    } else {
      summary[attendanceRow.status] += 1;
    }
  }

  return summary;
}

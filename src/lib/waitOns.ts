export type WaitOnSlotKey =
  | "monday_lunch"
  | "monday_dinner"
  | "tuesday_lunch"
  | "tuesday_dinner"
  | "wednesday_lunch"
  | "wednesday_dinner"
  | "thursday_lunch"
  | "thursday_dinner"
  | "friday_lunch"
  | "saturday_mop"
  | "sunday_wait_on";

export type WaitOnSlot = {
  key: WaitOnSlotKey;
  day: string;
  service: string;
  label: string;
  offsetDays: number;
};

export type WaitOnSchedule = {
  id: string;
  week_start: string;
  published: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type WaitOnAssignment = {
  id: string;
  schedule_id: string;
  slot_key: WaitOnSlotKey;
  brother_id: string;
  created_at: string | null;
  brotherName: string | null;
  brotherEmail: string | null;
};

export type BrotherOption = {
  user_id: string;
  name: string | null;
  email: string | null;
};

export type WaitOnScheduleWithAssignments = {
  schedule: WaitOnSchedule | null;
  assignments: WaitOnAssignment[];
};

export const waitOnSlots: WaitOnSlot[] = [
  { key: "monday_lunch", day: "Monday", service: "Lunch", label: "Monday Lunch", offsetDays: 0 },
  { key: "monday_dinner", day: "Monday", service: "Dinner", label: "Monday Dinner", offsetDays: 0 },
  { key: "tuesday_lunch", day: "Tuesday", service: "Lunch", label: "Tuesday Lunch", offsetDays: 1 },
  { key: "tuesday_dinner", day: "Tuesday", service: "Dinner", label: "Tuesday Dinner", offsetDays: 1 },
  { key: "wednesday_lunch", day: "Wednesday", service: "Lunch", label: "Wednesday Lunch", offsetDays: 2 },
  { key: "wednesday_dinner", day: "Wednesday", service: "Dinner", label: "Wednesday Dinner", offsetDays: 2 },
  { key: "thursday_lunch", day: "Thursday", service: "Lunch", label: "Thursday Lunch", offsetDays: 3 },
  { key: "thursday_dinner", day: "Thursday", service: "Dinner", label: "Thursday Dinner", offsetDays: 3 },
  { key: "friday_lunch", day: "Friday", service: "Lunch", label: "Friday Lunch", offsetDays: 4 },
  { key: "saturday_mop", day: "Saturday", service: "Mop", label: "Saturday Mop", offsetDays: 5 },
  { key: "sunday_wait_on", day: "Sunday", service: "Wait-on", label: "Sunday Wait-on", offsetDays: 6 },
];

export const waitOnSlotOrder = new Map<WaitOnSlotKey, number>(
  waitOnSlots.map((slot, index) => [slot.key, index])
);

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function toDateInputValue(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
}

export function parseDateInputValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(year, month - 1, day);
}

export function getWeekStartDate(date = new Date()) {
  const weekStart = new Date(date);
  weekStart.setHours(0, 0, 0, 0);
  const day = weekStart.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  weekStart.setDate(weekStart.getDate() - daysSinceMonday);
  return weekStart;
}

export function getCurrentWeekStartValue() {
  return toDateInputValue(getWeekStartDate());
}

export function normalizeWeekStartInput(value: string) {
  if (!value) {
    return getCurrentWeekStartValue();
  }

  return toDateInputValue(getWeekStartDate(parseDateInputValue(value)));
}

export function addDaysToDateInput(value: string, days: number) {
  const date = parseDateInputValue(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function formatWaitOnDate(value: string) {
  return parseDateInputValue(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatWaitOnSlotDate(weekStart: string, slot: WaitOnSlot) {
  return addDaysToDateInput(weekStart, slot.offsetDays).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatWeekRange(weekStart: string) {
  const endDate = addDaysToDateInput(weekStart, 6);
  return `${formatWaitOnDate(weekStart)} - ${endDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

export function formatWaitOnSlotLabel(slotKey: WaitOnSlotKey) {
  return waitOnSlots.find((slot) => slot.key === slotKey)?.label ?? "Wait-on";
}

export function compareWaitOnAssignments(a: WaitOnAssignment, b: WaitOnAssignment) {
  const slotComparison = (waitOnSlotOrder.get(a.slot_key) ?? 999) - (waitOnSlotOrder.get(b.slot_key) ?? 999);
  if (slotComparison !== 0) {
    return slotComparison;
  }

  return (a.brotherName ?? a.brotherEmail ?? "").localeCompare(b.brotherName ?? b.brotherEmail ?? "");
}

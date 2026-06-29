const eventDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/;

const eventTimeZone = "America/New_York";

type EventDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const defaultDateTimeOptions: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

const timeZoneFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: eventTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function parseFloatingEventDateTime(value: string): EventDateTimeParts | null {
  const match = value.trim().match(eventDateTimePattern);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second = "00", fraction = "0"] = match;
  const millisecond = Number(fraction.slice(0, 3).padEnd(3, "0"));

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    millisecond,
  };
}

function toDate(parts: EventDateTimeParts) {
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatPartsForTimestamp(parts: EventDateTimeParts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(
    parts.second,
  )}`;
}

function getTimeZonePartMap(date: Date) {
  return Object.fromEntries(timeZoneFormatter.formatToParts(date).map((part) => [part.type, part.value]));
}

function toEventTimeZoneTimestamp(date: Date) {
  const parts = getTimeZonePartMap(date);

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function toEventTimestamp(localDateTimeValue: string) {
  const parsed = parseFloatingEventDateTime(localDateTimeValue);
  if (!parsed) {
    return localDateTimeValue.trim();
  }

  return formatPartsForTimestamp(parsed);
}

export function toEventDateTimeInputValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsed = parseFloatingEventDateTime(value);
  if (parsed) {
    return `${parsed.year}-${pad(parsed.month)}-${pad(parsed.day)}T${pad(parsed.hour)}:${pad(parsed.minute)}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return toEventTimeZoneTimestamp(date).slice(0, 16);
}

export function parseEventDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = parseFloatingEventDateTime(value);
  if (parsed) {
    return toDate(parsed);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getEventDateTimeMs(value: string | null | undefined) {
  return parseEventDateTime(value)?.getTime() ?? 0;
}

export function compareEventDateTimes(left: string | null | undefined, right: string | null | undefined) {
  return getEventDateTimeMs(left) - getEventDateTimeMs(right);
}

export function isEventEndAfterStart(start: string, end: string) {
  return compareEventDateTimes(end, start) > 0;
}

export function formatEventDateTime(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = defaultDateTimeOptions,
) {
  if (!value) {
    return "Time not set";
  }

  const parsed = parseFloatingEventDateTime(value);
  if (parsed) {
    return toDate(parsed).toLocaleString("en-US", options);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Time not set";
  }

  return date.toLocaleString("en-US", { timeZone: eventTimeZone, ...options });
}

export function toCurrentEventTimestamp(date = new Date()) {
  return toEventTimeZoneTimestamp(date);
}

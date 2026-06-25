export const defaultEventType = "brotherhood_event" as const;

export const eventTypeOptions = [
  { slug: "party", label: "Party" },
  { slug: "formal", label: "Formal" },
  { slug: "sorority_fraternity", label: "Sorority/Fraternity" },
  { slug: "dei", label: "DEI" },
  { slug: "community_service", label: "Community Service" },
  { slug: "philanthropy", label: "Philanthropy" },
  { slug: "house_meeting", label: "House Meeting" },
  { slug: "alumni_event", label: "Alumni Event" },
  { slug: "rush", label: "Rush" },
  { slug: "scholarship", label: "Scholarship" },
  { slug: "professional_development", label: "Professional Development" },
  { slug: defaultEventType, label: "Brotherhood Event" },
  { slug: "hsm_event", label: "HSM Event" },
  { slug: "work_party", label: "Work Party" },
  { slug: "new_member_meeting", label: "New Member Meeting" },
  { slug: "new_member_event", label: "New Member Event" },
] as const;

export const generalEventTypeOptions = eventTypeOptions.filter(
  (eventType) =>
    eventType.slug !== "party" &&
    eventType.slug !== "formal" &&
    eventType.slug !== "community_service"
);

export type EventTypeSlug = (typeof eventTypeOptions)[number]["slug"];

const eventTypeLabels = new Map<EventTypeSlug, string>(
  eventTypeOptions.map((eventType) => [eventType.slug, eventType.label])
);

const eventTypeSlugs = new Set<string>(eventTypeOptions.map((eventType) => eventType.slug));

export function isEventTypeSlug(value: string | null | undefined): value is EventTypeSlug {
  return Boolean(value && eventTypeSlugs.has(value));
}

export function normalizeEventType(value: string | null | undefined): EventTypeSlug {
  return isEventTypeSlug(value) ? value : defaultEventType;
}

export function getEventTypeLabel(value: string | null | undefined): string {
  return eventTypeLabels.get(normalizeEventType(value)) ?? "Brotherhood Event";
}

export function getEventTypeClassName(value: string | null | undefined): string {
  return `event-type--${normalizeEventType(value)}`;
}

export function getEventTypeSqlValues(): EventTypeSlug[] {
  return eventTypeOptions.map((eventType) => eventType.slug);
}

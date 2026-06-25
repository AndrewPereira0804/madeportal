export type CommunityServiceAttendee = {
  id: string;
  brotherName: string;
  hours: number;
  hoursLoggedWithNationals: boolean;
};

export type CommunityServiceEventDetails = {
  organization: string;
  location: string;
  eventLoggedWithNationals: boolean;
  attendees: CommunityServiceAttendee[];
};

export type CommunityServiceTotals = {
  attendeeCount: number;
  totalHours: number;
  hoursLoggedCount: number;
  pendingHoursCount: number;
};

function createItemId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNonNegativeNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeAttendees(value: unknown): CommunityServiceAttendee[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const brotherName = typeof item.brotherName === "string" ? item.brotherName.trim() : "";
      if (!brotherName) {
        return null;
      }

      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id : createItemId(),
        brotherName,
        hours: normalizeNonNegativeNumber(item.hours),
        hoursLoggedWithNationals: item.hoursLoggedWithNationals === true,
      };
    })
    .filter((item): item is CommunityServiceAttendee => item !== null);
}

export function createCommunityServiceAttendee(
  brotherName: string,
  hours: number,
): CommunityServiceAttendee {
  return {
    id: createItemId(),
    brotherName: brotherName.trim(),
    hours: normalizeNonNegativeNumber(hours),
    hoursLoggedWithNationals: false,
  };
}

export function createCommunityServiceEventDetails(
  organization: string,
  location: string,
): CommunityServiceEventDetails {
  return {
    organization: organization.trim(),
    location: location.trim(),
    eventLoggedWithNationals: false,
    attendees: [],
  };
}

export function normalizeCommunityServiceEventDetails(value: unknown): CommunityServiceEventDetails {
  if (!isRecord(value)) {
    return createCommunityServiceEventDetails("", "");
  }

  return {
    organization: typeof value.organization === "string" ? value.organization : "",
    location: typeof value.location === "string" ? value.location : "",
    eventLoggedWithNationals: value.eventLoggedWithNationals === true,
    attendees: normalizeAttendees(value.attendees),
  };
}

export function calculateCommunityServiceTotals(
  details: CommunityServiceEventDetails,
): CommunityServiceTotals {
  const attendeeCount = details.attendees.length;
  const totalHours = details.attendees.reduce((total, attendee) => total + attendee.hours, 0);
  const hoursLoggedCount = details.attendees.filter((attendee) => attendee.hoursLoggedWithNationals).length;

  return {
    attendeeCount,
    totalHours,
    hoursLoggedCount,
    pendingHoursCount: attendeeCount - hoursLoggedCount,
  };
}

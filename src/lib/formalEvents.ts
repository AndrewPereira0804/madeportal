export type FormalChecklistItem = {
  id: string;
  text: string;
  completed: boolean;
};

export type FormalAttendee = {
  id: string;
  brotherName: string;
  drinkingGuestCount: number;
  paid: boolean;
};

export type FormalEventDetails = {
  theme: string;
  totalCost: number;
  attendees: FormalAttendee[];
  setupChecklist: FormalChecklistItem[];
};

export type FormalTotals = {
  brotherCount: number;
  drinkingGuestCount: number;
  totalDrinking: number;
  pricePerDrinker: number;
  paidBrotherCount: number;
  unpaidAmount: number;
};

const defaultSetupChecklistItems: FormalChecklistItem[] = [
  { id: "setup-venue", text: "Confirm venue and contract details", completed: false },
  { id: "setup-theme", text: "Finalize theme and decorations", completed: false },
  { id: "setup-attendance", text: "Finalize drinking list", completed: false },
  { id: "setup-cost", text: "Confirm total event cost", completed: false },
  { id: "setup-payments", text: "Collect brother payments", completed: false },
  { id: "setup-transportation", text: "Confirm transportation plan", completed: false },
];

function cloneChecklist(items: FormalChecklistItem[]) {
  return items.map((item) => ({ ...item }));
}

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

function normalizeGuestCount(value: unknown) {
  const parsed = Math.floor(normalizeNonNegativeNumber(value));
  return parsed >= 0 ? parsed : 0;
}

function normalizeChecklist(value: unknown): FormalChecklistItem[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (!text) {
        return null;
      }

      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id : createItemId(),
        text,
        completed: item.completed === true,
      };
    })
    .filter((item): item is FormalChecklistItem => item !== null);
}

function normalizeAttendees(value: unknown): FormalAttendee[] {
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
        drinkingGuestCount: normalizeGuestCount(item.drinkingGuestCount),
        paid: item.paid === true,
      };
    })
    .filter((item): item is FormalAttendee => item !== null);
}

export function createFormalChecklistItem(text: string): FormalChecklistItem {
  return {
    id: createItemId(),
    text: text.trim(),
    completed: false,
  };
}

export function createFormalAttendee(brotherName: string, drinkingGuestCount: number): FormalAttendee {
  return {
    id: createItemId(),
    brotherName: brotherName.trim(),
    drinkingGuestCount: normalizeGuestCount(drinkingGuestCount),
    paid: false,
  };
}

export function createFormalEventDetails(theme: string, totalCost: number): FormalEventDetails {
  return {
    theme: theme.trim(),
    totalCost: normalizeNonNegativeNumber(totalCost),
    attendees: [],
    setupChecklist: cloneChecklist(defaultSetupChecklistItems),
  };
}

export function normalizeFormalEventDetails(value: unknown): FormalEventDetails {
  if (!isRecord(value)) {
    return createFormalEventDetails("", 0);
  }

  const setupChecklist = normalizeChecklist(value.setupChecklist);

  return {
    theme: typeof value.theme === "string" ? value.theme : "",
    totalCost: normalizeNonNegativeNumber(value.totalCost),
    attendees: normalizeAttendees(value.attendees),
    setupChecklist: setupChecklist ?? cloneChecklist(defaultSetupChecklistItems),
  };
}

export function calculateFormalAttendeeOwed(attendee: FormalAttendee, pricePerDrinker: number) {
  return pricePerDrinker * (1 + attendee.drinkingGuestCount);
}

export function calculateFormalTotals(details: FormalEventDetails): FormalTotals {
  const brotherCount = details.attendees.length;
  const drinkingGuestCount = details.attendees.reduce(
    (total, attendee) => total + attendee.drinkingGuestCount,
    0,
  );
  const totalDrinking = brotherCount + drinkingGuestCount;
  const pricePerDrinker = totalDrinking > 0 ? details.totalCost / totalDrinking : 0;
  const paidBrotherCount = details.attendees.filter((attendee) => attendee.paid).length;
  const unpaidAmount =
    totalDrinking === 0
      ? details.totalCost
      : details.attendees
          .filter((attendee) => !attendee.paid)
          .reduce((total, attendee) => total + calculateFormalAttendeeOwed(attendee, pricePerDrinker), 0);

  return {
    brotherCount,
    drinkingGuestCount,
    totalDrinking,
    pricePerDrinker,
    paidBrotherCount,
    unpaidAmount,
  };
}

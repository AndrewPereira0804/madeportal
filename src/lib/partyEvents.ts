export type PartyChecklistItem = {
  id: string;
  text: string;
  completed: boolean;
};

export type PartyChecklistKey = "preChecklist" | "postChecklist";

export type PartyEventDetails = {
  theme: string;
  inviteListUrl: string;
  preChecklist: PartyChecklistItem[];
  postChecklist: PartyChecklistItem[];
};

const defaultPrePartyChecklistItems: PartyChecklistItem[] = [
  { id: "pre-invite-list", text: "Confirm invite list", completed: false },
  { id: "pre-risk-plan", text: "Confirm risk plan", completed: false },
  { id: "pre-monitors", text: "Assign monitors and sober contacts", completed: false },
  { id: "pre-theme-supplies", text: "Confirm theme supplies", completed: false },
  { id: "pre-cleanup-plan", text: "Set cleanup plan", completed: false },
];

const defaultPostPartyChecklistItems: PartyChecklistItem[] = [
  { id: "post-cleanup", text: "Complete cleanup", completed: false },
  { id: "post-attendance", text: "Record attendance notes", completed: false },
  { id: "post-incidents", text: "Save incident notes", completed: false },
  { id: "post-expenses", text: "Log expenses or receipts", completed: false },
  { id: "post-close-list", text: "Close invite list", completed: false },
];

function cloneChecklist(items: PartyChecklistItem[]) {
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

function normalizeChecklist(value: unknown): PartyChecklistItem[] | null {
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
    .filter((item): item is PartyChecklistItem => item !== null);
}

export function createPartyChecklistItem(text: string): PartyChecklistItem {
  return {
    id: createItemId(),
    text: text.trim(),
    completed: false,
  };
}

export function createPartyEventDetails(theme: string, inviteListUrl: string): PartyEventDetails {
  return {
    theme: theme.trim(),
    inviteListUrl: inviteListUrl.trim(),
    preChecklist: cloneChecklist(defaultPrePartyChecklistItems),
    postChecklist: cloneChecklist(defaultPostPartyChecklistItems),
  };
}

export function normalizePartyEventDetails(value: unknown): PartyEventDetails {
  if (!isRecord(value)) {
    return createPartyEventDetails("", "");
  }

  const preChecklist = normalizeChecklist(value.preChecklist);
  const postChecklist = normalizeChecklist(value.postChecklist);

  return {
    theme: typeof value.theme === "string" ? value.theme : "",
    inviteListUrl: typeof value.inviteListUrl === "string" ? value.inviteListUrl : "",
    preChecklist: preChecklist ?? cloneChecklist(defaultPrePartyChecklistItems),
    postChecklist: postChecklist ?? cloneChecklist(defaultPostPartyChecklistItems),
  };
}

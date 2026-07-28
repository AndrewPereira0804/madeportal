export const emergencyContactTypeOptions = [
  { value: "mother", label: "Mother" },
  { value: "father", label: "Father" },
  { value: "parent", label: "Parent" },
  { value: "guardian", label: "Guardian" },
  { value: "sibling", label: "Sibling" },
  { value: "spouse", label: "Spouse" },
  { value: "partner", label: "Partner" },
  { value: "child", label: "Child" },
  { value: "grandparent", label: "Grandparent" },
  { value: "aunt_uncle", label: "Aunt/Uncle" },
  { value: "cousin", label: "Cousin" },
  { value: "friend", label: "Friend" },
  { value: "roommate", label: "Roommate" },
  { value: "other", label: "Other" },
] as const;

export type EmergencyContactType = (typeof emergencyContactTypeOptions)[number]["value"];

export type EmergencyContactRow = {
  id: string;
  user_id: string;
  contact_type: EmergencyContactType;
  name: string;
  phone: string;
  email: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type EmergencyContactDraft = {
  contactType: EmergencyContactType | "";
  name: string;
  phone: string;
  email: string;
};

export type EmergencyContactPayload = {
  contact_type: EmergencyContactType;
  name: string;
  phone: string;
  email: string | null;
};

export type EmergencyContactInsertPayload = EmergencyContactPayload & {
  user_id: string;
};

export type RawEmergencyContactRow = {
  id?: unknown;
  user_id?: unknown;
  contact_type?: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

export const EMERGENCY_CONTACT_COLUMNS =
  "id,user_id,contact_type,name,phone,email,created_at,updated_at";

function toCleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isEmergencyContactType(value: unknown): value is EmergencyContactType {
  return emergencyContactTypeOptions.some((option) => option.value === value);
}

export function formatEmergencyContactType(value: EmergencyContactType) {
  return emergencyContactTypeOptions.find((option) => option.value === value)?.label ?? value;
}

export function normalizeEmergencyContact(row: RawEmergencyContactRow | null | undefined): EmergencyContactRow | null {
  const id = toCleanString(row?.id);
  const userId = toCleanString(row?.user_id);
  const contactType = row?.contact_type;
  const name = toCleanString(row?.name);
  const phone = toCleanString(row?.phone);

  if (!id || !userId || !isEmergencyContactType(contactType) || !name || !phone) {
    return null;
  }

  return {
    id,
    user_id: userId,
    contact_type: contactType,
    name,
    phone,
    email: toCleanString(row?.email),
    created_at: toCleanString(row?.created_at),
    updated_at: toCleanString(row?.updated_at),
  };
}

export function createBlankEmergencyContactDraft(): EmergencyContactDraft {
  return {
    contactType: "",
    name: "",
    phone: "",
    email: "",
  };
}

export function emergencyContactToDraft(contact: EmergencyContactRow): EmergencyContactDraft {
  return {
    contactType: contact.contact_type,
    name: contact.name,
    phone: contact.phone,
    email: contact.email ?? "",
  };
}

export function sortEmergencyContacts(contacts: EmergencyContactRow[]) {
  return [...contacts].sort((a, b) => {
    const aTime = a.created_at ? Date.parse(a.created_at) : 0;
    const bTime = b.created_at ? Date.parse(b.created_at) : 0;
    return bTime - aTime;
  });
}

export function buildEmergencyContactPayload(
  draft: EmergencyContactDraft
): { payload: EmergencyContactPayload; errorMessage: null } | { payload: null; errorMessage: string } {
  if (!isEmergencyContactType(draft.contactType)) {
    return { payload: null, errorMessage: "Choose a contact type." };
  }

  const name = draft.name.trim();
  if (!name) {
    return { payload: null, errorMessage: "Contact name is required." };
  }

  const phone = draft.phone.trim();
  if (!phone) {
    return { payload: null, errorMessage: "Contact phone number is required." };
  }

  const email = draft.email.trim();

  return {
    payload: {
      contact_type: draft.contactType,
      name,
      phone,
      email: email || null,
    },
    errorMessage: null,
  };
}

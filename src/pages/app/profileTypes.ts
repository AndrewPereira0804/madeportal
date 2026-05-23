export type AccountStatus = "pending" | "active" | "suspended";

export type ProfileRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  status: AccountStatus;
  created_at: string | null;
  phone: string | null;
  grad_year: number | null;
  major: number | null;
  hometown: string | null;
};

export type MajorRow = {
  id: number;
  major: string;
  slug: string | null;
};

export type RoleDetail = {
  slug: string;
  name: string | null;
};

export type ProfileDraft = {
  name: string;
  phone: string;
  gradYear: string;
  majorId: string;
  hometown: string;
};

export type RawProfileRow = {
  user_id?: unknown;
  name?: unknown;
  email?: unknown;
  status?: unknown;
  created_at?: unknown;
  phone?: unknown;
  grad_year?: unknown;
  major?: unknown;
  hometown?: unknown;
};

export type RawMajorRow = {
  id?: unknown;
  major?: unknown;
  slug?: unknown;
};

export type RawUserRoleRow = {
  role_slug?: unknown;
  roles?: unknown;
};

export type ProfileUpdatePayload = {
  name: string | null;
  phone: string | null;
  grad_year: number | null;
  major: number | null;
  hometown: string | null;
};

export const NO_INFO = "No info provided";

export const PROFILE_COLUMNS = "user_id,name,email,status,created_at,phone,grad_year,major,hometown";

export function isAccountStatus(value: unknown): value is AccountStatus {
  return value === "pending" || value === "active" || value === "suspended";
}

export function toCleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function toNullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeProfile(row: RawProfileRow | null | undefined): ProfileRow | null {
  const userId = toCleanString(row?.user_id);
  const status = row?.status;

  if (!userId || !isAccountStatus(status)) {
    return null;
  }

  return {
    user_id: userId,
    name: toCleanString(row?.name),
    email: toCleanString(row?.email),
    status,
    created_at: toCleanString(row?.created_at),
    phone: toCleanString(row?.phone),
    grad_year: toNumberOrNull(row?.grad_year),
    major: toNumberOrNull(row?.major),
    hometown: toCleanString(row?.hometown),
  };
}

export function normalizeMajor(row: RawMajorRow): MajorRow | null {
  const id = toNumberOrNull(row.id);
  const major = toCleanString(row.major);

  if (id === null || !major) {
    return null;
  }

  return {
    id,
    major,
    slug: toCleanString(row.slug),
  };
}

export function normalizeRoleDetail(row: RawUserRoleRow): RoleDetail | null {
  const slug = toCleanString(row.role_slug);
  if (!slug) {
    return null;
  }

  const roleObject =
    row.roles && typeof row.roles === "object" && !Array.isArray(row.roles)
      ? (row.roles as Record<string, unknown>)
      : null;

  return {
    slug,
    name: toCleanString(roleObject?.name),
  };
}

export function normalizeRoles(rows: RawUserRoleRow[]): RoleDetail[] {
  return rows
    .map(normalizeRoleDetail)
    .filter((row): row is RoleDetail => row !== null)
    .sort((a, b) => (a.name ?? a.slug).localeCompare(b.name ?? b.slug));
}

export function profileToDraft(profile: ProfileRow): ProfileDraft {
  return {
    name: profile.name ?? "",
    phone: profile.phone ?? "",
    gradYear: profile.grad_year === null ? "" : String(profile.grad_year),
    majorId: profile.major === null ? "" : String(profile.major),
    hometown: profile.hometown ?? "",
  };
}

export function formatCreatedAt(value: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function profileSortValue(profile: ProfileRow) {
  return (profile.name ?? profile.email ?? profile.user_id).toLowerCase();
}

export function buildProfileUpdatePayload(
  draft: ProfileDraft,
  currentMajorId: number | null,
  majors: MajorRow[]
): { payload: ProfileUpdatePayload; errorMessage: null } | { payload: null; errorMessage: string } {
  const gradYear = draft.gradYear.trim() ? Number(draft.gradYear) : null;
  if (gradYear !== null && (!Number.isInteger(gradYear) || gradYear < 1900 || gradYear > 2200)) {
    return { payload: null, errorMessage: "Graduation year must be a valid year." };
  }

  const major = draft.majorId ? Number(draft.majorId) : null;
  if (major !== null && major !== currentMajorId && !majors.some((row) => row.id === major)) {
    return { payload: null, errorMessage: "Choose a valid major." };
  }

  return {
    payload: {
      name: toNullableText(draft.name),
      phone: toNullableText(draft.phone),
      grad_year: gradYear,
      major,
      hometown: toNullableText(draft.hometown),
    },
    errorMessage: null,
  };
}

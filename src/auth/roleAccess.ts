import { eventTypeOptions, type EventTypeSlug } from "../lib/eventTypes";

export type AccountStatus = "pending" | "active" | "suspended";
export type ChapterStatus = "neophyte" | "brother" | "alumni";

export type EventVisibility = {
  created_by?: string | null;
  visible_to_alum?: boolean | null;
  visible_to_neophyte?: boolean | null;
};

const chapterStatusByRoleSlug: Record<string, ChapterStatus> = {
  neophyte: "neophyte",
  brother: "brother",
  alum: "alumni",
  alumni: "alumni",
};

const chapterStatusPriority = ["brother", "neophyte", "alum", "alumni"];
const adminRoleSlugs = new Set(["admin"]);
const presidentRoleSlugs = new Set(["president", "ea"]);
const vicePresidentRoleSlugs = new Set(["vice-president", "vice_president", "vp", "eda"]);

const memberManagerRoleSlugs = new Set([
  ...adminRoleSlugs,
  ...presidentRoleSlugs,
  ...vicePresidentRoleSlugs,
]);

const budgetManagerRoleSlugs = new Set([
  ...memberManagerRoleSlugs,
  "treasurer",
]);

const budgetAccountRoleSlugs = new Set([
  "social-chair",
  "rush-chair",
  "cs-chair",
  "community-service-chair",
  "philo-chair",
  "philanthropy-chair",
  "scholarship",
  "membered",
  "member-educator",
  "preceptor",
  "hm",
  "house-manager",
  "hsm",
  "health-safety-manager",
  "stew",
  "steward",
  "treasurer",
]);

const recorderRoleSlugs = new Set(["rec", "recorder"]);

const fullEventManagerRoleSlugs = new Set([
  ...memberManagerRoleSlugs,
  ...recorderRoleSlugs,
]);

const canonicalChairToolRoleSlugs = [
  "social-chair",
  "rush-chair",
  "cs-chair",
  "philo-chair",
  "scholarship",
  "membered",
  "preceptor",
  "hm",
  "hsm",
  "rec",
  "stew",
];

const chairRoleSlugs = new Set([
  ...canonicalChairToolRoleSlugs,
  "community-service-chair",
  "philanthropy-chair",
  "member-educator",
  "house-manager",
  "health-safety-manager",
  "recorder",
  "steward",
]);

const ownEventManagerRoleSlugs = new Set([
  ...chairRoleSlugs,
  "treasurer",
]);

const partyEventManagerRoleSlugs = new Set(["social-chair"]);

const eventTypeManagerRoleSlugs: Record<EventTypeSlug, string[]> = {
  party: ["social-chair"],
  formal: ["social-chair"],
  sorority_fraternity: ["social-chair"],
  dei: [],
  community_service: ["cs-chair", "community-service-chair"],
  philanthropy: ["philo-chair", "philanthropy-chair"],
  house_meeting: ["hm", "house-manager"],
  alumni_event: ["rec", "recorder"],
  rush: ["rush-chair"],
  scholarship: ["scholarship"],
  professional_development: ["scholarship"],
  brotherhood_event: ["stew", "steward"],
  work_party: ["hm", "house-manager", "stew", "steward"],
  new_member_meeting: ["membered", "member-educator", "preceptor"],
  new_member_event: ["membered", "member-educator", "preceptor"],
};

function normalizeRoleSlug(roleSlug: string) {
  return roleSlug.trim().toLowerCase();
}

function normalizeRoleSet(roles: string[]) {
  return new Set(
    roles
      .map(normalizeRoleSlug)
      .filter(Boolean)
  );
}

function hasAnyRole(roleSet: Set<string>, allowedRoles: Set<string>) {
  for (const role of allowedRoles) {
    if (roleSet.has(role)) {
      return true;
    }
  }

  return false;
}

export function isChapterStatusRoleSlug(roleSlug: string) {
  return normalizeRoleSlug(roleSlug) in chapterStatusByRoleSlug;
}

export function getChapterStatus(roles: string[]): ChapterStatus | null {
  const roleSet = normalizeRoleSet(roles);

  if (roleSet.has("brother")) {
    return "brother";
  }

  if (roleSet.has("neophyte")) {
    return "neophyte";
  }

  if (roleSet.has("alum") || roleSet.has("alumni")) {
    return "alumni";
  }

  return null;
}

export function hasAdminRole(roles: string[]) {
  return normalizeRoleSet(roles).has("admin");
}

export function hasPresidentOrVicePresidentRole(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return hasAnyRole(roleSet, presidentRoleSlugs) || hasAnyRole(roleSet, vicePresidentRoleSlugs);
}

export function getStatusRedirectPath(status: string | null, currentPath: string) {
  if (status === "pending" && currentPath !== "/pending") {
    return "/pending";
  }

  if (status === "suspended" && currentPath !== "/suspended") {
    return "/suspended";
  }

  return null;
}

export function canAccessApp(status: string | null, roles: string[]) {
  if (status === "pending" || status === "suspended") {
    return false;
  }

  if (status !== "active") {
    return false;
  }

  return hasAdminRole(roles) || getChapterStatus(roles) !== null;
}

function hasAlumniBaseline(roles: string[]) {
  return getChapterStatus(roles) === "alumni";
}

function hasActiveChapterBaseline(roles: string[]) {
  const chapterStatus = getChapterStatus(roles);
  return chapterStatus === "neophyte" || chapterStatus === "brother";
}

export function canManageMembers(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return !hasAlumniBaseline(roles) && hasAnyRole(roleSet, memberManagerRoleSlugs);
}

export function canManageBudgets(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return !hasAlumniBaseline(roles) && hasAnyRole(roleSet, budgetManagerRoleSlugs);
}

export function getBudgetAccountRoleSlugs(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return [...budgetAccountRoleSlugs].filter((roleSlug) => roleSet.has(roleSlug));
}

export function getChairRoleSlugs(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return [...chairRoleSlugs].filter((roleSlug) => roleSet.has(roleSlug));
}

export function getKnownChairToolRoleSlugs() {
  return [...canonicalChairToolRoleSlugs];
}

export function isChairRoleSlug(roleSlug: string) {
  return chairRoleSlugs.has(normalizeRoleSlug(roleSlug));
}

export function canAccessChairTool(roles: string[], roleSlug: string) {
  const normalizedRoleSlug = normalizeRoleSlug(roleSlug);
  if (hasAlumniBaseline(roles) || !chairRoleSlugs.has(normalizedRoleSlug)) {
    return false;
  }

  const roleSet = normalizeRoleSet(roles);
  return roleSet.has(normalizedRoleSlug) || canManageBudgets(roles);
}

export function canAccessBudgets(roles: string[]) {
  return canManageBudgets(roles) || getBudgetAccountRoleSlugs(roles).length > 0;
}

export function canAccessBudgetAccount(roles: string[], accountRoleSlug: string) {
  if (canManageBudgets(roles)) {
    return true;
  }

  const roleSet = normalizeRoleSet(roles);
  return budgetAccountRoleSlugs.has(normalizeRoleSlug(accountRoleSlug)) && roleSet.has(normalizeRoleSlug(accountRoleSlug));
}

export function canManageAllEvents(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return !hasAlumniBaseline(roles) && hasAnyRole(roleSet, fullEventManagerRoleSlugs);
}

export function canManageOwnEvents(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return hasActiveChapterBaseline(roles) && hasAnyRole(roleSet, ownEventManagerRoleSlugs);
}

export function canManageEvents(roles: string[]) {
  return canManageAllEvents(roles) || getManageableEventTypes(roles).length > 0 || canManageOwnEvents(roles);
}

export function getManageableEventTypes(roles: string[]) {
  if (canManageAllEvents(roles)) {
    return eventTypeOptions.map((eventType) => eventType.slug);
  }

  const roleSet = normalizeRoleSet(roles);
  return eventTypeOptions
    .filter((eventType) =>
      eventTypeManagerRoleSlugs[eventType.slug].some((roleSlug) => roleSet.has(roleSlug))
    )
    .map((eventType) => eventType.slug);
}

export function canManageEventType(roles: string[], eventType: string | null | undefined) {
  if (canManageAllEvents(roles)) {
    return true;
  }

  if (!eventType) {
    return false;
  }

  return getManageableEventTypes(roles).includes(eventType as EventTypeSlug);
}

export function canManageEvent(
  roles: string[],
  eventCreatedBy: string | null,
  currentUserId: string | null,
  eventType?: string | null,
) {
  if (canManageEventType(roles, eventType)) {
    return true;
  }

  return Boolean(canManageOwnEvents(roles) && eventCreatedBy && currentUserId && eventCreatedBy === currentUserId);
}

export function canManagePartyEvents(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return !hasAlumniBaseline(roles) && hasAnyRole(roleSet, partyEventManagerRoleSlugs);
}

export function canViewEvent(roles: string[], event: EventVisibility, currentUserId?: string | null) {
  if (canManageAllEvents(roles)) {
    return true;
  }

  if (event.created_by && currentUserId && event.created_by === currentUserId && canManageOwnEvents(roles)) {
    return true;
  }

  const chapterStatus = getChapterStatus(roles);
  if (chapterStatus === "brother") {
    return true;
  }

  if (chapterStatus === "neophyte") {
    return Boolean(event.visible_to_neophyte);
  }

  if (chapterStatus === "alumni") {
    return Boolean(event.visible_to_alum);
  }

  return false;
}

export function canModerateAnnouncements(roles: string[]) {
  return !hasAlumniBaseline(roles) && hasAdminRole(roles);
}

export function canCreateAnnouncements(roles: string[]) {
  return !hasAlumniBaseline(roles) && (hasAdminRole(roles) || hasPresidentOrVicePresidentRole(roles));
}

export function canAccessManagement(roles: string[]) {
  return canManageMembers(roles);
}

export function canAccessSystemAdmin(roles: string[]) {
  return hasAdminRole(roles);
}

export function normalizeRoleSlugsForAssignment(roleSlugs: string[]) {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const roleSlug of roleSlugs) {
    const normalized = normalizeRoleSlug(roleSlug);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduped.push(roleSlug.trim());
  }

  const selectedChapterRole = chapterStatusPriority.find((roleSlug) => seen.has(roleSlug));
  if (!selectedChapterRole) {
    return deduped.sort();
  }

  return deduped
    .filter((roleSlug) => !isChapterStatusRoleSlug(roleSlug) || normalizeRoleSlug(roleSlug) === selectedChapterRole)
    .sort();
}

export function toggleRoleForAssignment(currentRoleSlugs: string[], roleSlug: string) {
  const normalized = normalizeRoleSlug(roleSlug);
  const isSelected = currentRoleSlugs.some((currentRoleSlug) => normalizeRoleSlug(currentRoleSlug) === normalized);

  if (isSelected) {
    return normalizeRoleSlugsForAssignment(
      currentRoleSlugs.filter((currentRoleSlug) => normalizeRoleSlug(currentRoleSlug) !== normalized)
    );
  }

  if (isChapterStatusRoleSlug(roleSlug)) {
    return normalizeRoleSlugsForAssignment([
      ...currentRoleSlugs.filter((currentRoleSlug) => !isChapterStatusRoleSlug(currentRoleSlug)),
      roleSlug,
    ]);
  }

  return normalizeRoleSlugsForAssignment([...currentRoleSlugs, roleSlug]);
}

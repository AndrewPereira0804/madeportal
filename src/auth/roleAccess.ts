import { eventTypeOptions, type EventTypeSlug } from "../lib/eventTypes";

export type AccountStatus = "pending" | "active" | "suspended";
export type ChapterStatus = "neophyte" | "brother" | "alumni";

export type EventVisibility = {
  created_by?: string | null;
  event_type?: string | null;
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
  "alumni-chair",
  "alumni-chairman",
  "chapter-dev",
  "chapter-dev-chair",
  "chapter-development",
  "chapter-development-chair",
  "social-chair",
  "cs-chair",
  "community-service-chair",
  "philo-chair",
  "philanthropy-chair",
  "professional-dev",
  "professional-dev-chair",
  "professional-development",
  "professional-development-chair",
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

const roleAssignmentManagerRoleSlugs = new Set([
  ...memberManagerRoleSlugs,
  ...recorderRoleSlugs,
]);

const presidentRestrictedRoleSlugs = new Set([
  ...adminRoleSlugs,
  ...presidentRoleSlugs,
]);

const vicePresidentRestrictedRoleSlugs = new Set([
  ...presidentRestrictedRoleSlugs,
  ...vicePresidentRoleSlugs,
]);

const recorderRestrictedRoleSlugs = new Set([
  ...vicePresidentRestrictedRoleSlugs,
  ...recorderRoleSlugs,
]);

const fullEventManagerRoleSlugs = new Set([
  ...memberManagerRoleSlugs,
  ...recorderRoleSlugs,
]);

const canonicalChairToolRoleSlugs = [
  "alumni-chair",
  "chapter-dev",
  "social-chair",
  "cs-chair",
  "philo-chair",
  "professional-dev",
  "scholarship",
  "membered",
  "hm",
  "hsm",
  "rec",
  "stew",
  "treasurer",
];

const chairRoleSlugs = new Set([
  ...canonicalChairToolRoleSlugs,
  "alumni-chairman",
  "chapter-dev-chair",
  "chapter-development",
  "chapter-development-chair",
  "community-service-chair",
  "philanthropy-chair",
  "member-educator",
  "house-manager",
  "health-safety-manager",
  "professional-dev-chair",
  "professional-development",
  "professional-development-chair",
  "preceptor",
  "recorder",
  "stew",
  "steward",
  "treasurer",
]);

const alumniEventToolRoleSlugs = new Set(["alumni-chair", "alumni-chairman"]);
const partyFormalEventToolRoleSlugs = new Set(["social-chair", "hsm", "health-safety-manager"]);
const communityServiceEventToolRoleSlugs = new Set(["cs-chair", "community-service-chair"]);
const professionalDevelopmentEventToolRoleSlugs = new Set([
  "professional-dev",
  "professional-dev-chair",
  "professional-development",
  "professional-development-chair",
]);
const waitOnToolRoleSlugs = new Set(["stew", "steward"]);
const emergencyContactReaderRoleSlugs = new Set([
  "admin",
  "ea",
  "eda",
  "hsm",
  "health-safety-manager",
]);

const eventTypeManagerRoleSlugs: Record<EventTypeSlug, string[]> = {
  party: ["social-chair", "hsm", "health-safety-manager"],
  formal: ["social-chair", "hsm", "health-safety-manager"],
  sorority_fraternity: [],
  dei: [],
  community_service: ["cs-chair", "community-service-chair"],
  philanthropy: ["philo-chair", "philanthropy-chair"],
  house_meeting: ["hm", "house-manager"],
  alumni_event: ["alumni-chair", "alumni-chairman"],
  rush: [],
  scholarship: ["scholarship"],
  professional_development: [
    "professional-dev",
    "professional-dev-chair",
    "professional-development",
    "professional-development-chair",
  ],
  brotherhood_event: [
    "chapter-dev",
    "chapter-dev-chair",
    "chapter-development",
    "chapter-development-chair",
    "hsm",
    "health-safety-manager",
  ],
  hsm_event: ["hsm", "health-safety-manager"],
  work_party: ["hm", "house-manager"],
  new_member_meeting: ["membered", "member-educator"],
  new_member_event: ["membered", "member-educator"],
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

export function hasAlumniRole(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return roleSet.has("alum") || roleSet.has("alumni");
}

export function hasPresidentOrVicePresidentRole(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return hasAnyRole(roleSet, presidentRoleSlugs) || hasAnyRole(roleSet, vicePresidentRoleSlugs);
}

export function getStatusRedirectPath(status: string | null, currentPath: string) {
  if (status === "active" && (currentPath === "/pending" || currentPath === "/suspended")) {
    return "/app";
  }

  if ((status === null || status === "pending") && currentPath !== "/pending") {
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

export function canManageMembers(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return hasAnyRole(roleSet, memberManagerRoleSlugs);
}

export function canManageRoleAssignments(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return hasAnyRole(roleSet, roleAssignmentManagerRoleSlugs);
}

export function canAssignRole(roles: string[], targetRoleSlug: string) {
  const roleSet = normalizeRoleSet(roles);
  const normalizedTargetRoleSlug = normalizeRoleSlug(targetRoleSlug);

  if (!normalizedTargetRoleSlug) {
    return false;
  }

  if (hasAnyRole(roleSet, adminRoleSlugs)) {
    return true;
  }

  if (hasAnyRole(roleSet, presidentRoleSlugs)) {
    return !presidentRestrictedRoleSlugs.has(normalizedTargetRoleSlug);
  }

  if (hasAnyRole(roleSet, vicePresidentRoleSlugs)) {
    return !vicePresidentRestrictedRoleSlugs.has(normalizedTargetRoleSlug);
  }

  if (hasAnyRole(roleSet, recorderRoleSlugs)) {
    return !recorderRestrictedRoleSlugs.has(normalizedTargetRoleSlug);
  }

  return false;
}

export function canManageBudgets(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return hasAnyRole(roleSet, budgetManagerRoleSlugs);
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

export function canAccessAllChairTools(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return hasAnyRole(roleSet, memberManagerRoleSlugs);
}

export function canAccessChairTool(roles: string[], roleSlug: string) {
  const normalizedRoleSlug = normalizeRoleSlug(roleSlug);
  if (!chairRoleSlugs.has(normalizedRoleSlug)) {
    return false;
  }

  const roleSet = normalizeRoleSet(roles);
  return roleSet.has(normalizedRoleSlug) || canAccessAllChairTools(roles);
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
  return hasAnyRole(roleSet, fullEventManagerRoleSlugs);
}

export function canManageEvents(roles: string[]) {
  return canManageAllEvents(roles) || getManageableEventTypes(roles).length > 0;
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
  _eventCreatedBy: string | null,
  _currentUserId: string | null,
  eventType?: string | null,
) {
  return canManageEventType(roles, eventType);
}

export function canManagePartyEvents(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return canAccessAllChairTools(roles) || hasAnyRole(roleSet, partyFormalEventToolRoleSlugs);
}

export function canManageFormalEvents(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return canAccessAllChairTools(roles) || hasAnyRole(roleSet, partyFormalEventToolRoleSlugs);
}

export function canManageCommunityServiceEvents(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return canAccessAllChairTools(roles) || hasAnyRole(roleSet, communityServiceEventToolRoleSlugs);
}

export function canManageAlumniEvents(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return canAccessAllChairTools(roles) || hasAnyRole(roleSet, alumniEventToolRoleSlugs);
}

export function canManageProfessionalDevelopmentEvents(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return canAccessAllChairTools(roles) || hasAnyRole(roleSet, professionalDevelopmentEventToolRoleSlugs);
}

export function canManageWaitOns(roles: string[]) {
  const roleSet = normalizeRoleSet(roles);
  return canAccessAllChairTools(roles) || hasAnyRole(roleSet, waitOnToolRoleSlugs);
}

export function canReadAllEmergencyContacts(roles: string[]) {
  return hasAnyRole(normalizeRoleSet(roles), emergencyContactReaderRoleSlugs);
}

export function canManageAllEmergencyContacts(roles: string[]) {
  return hasAdminRole(roles);
}

export function canViewEvent(roles: string[], event: EventVisibility) {
  if (canManageAllEvents(roles)) {
    return true;
  }

  if (canManageEventType(roles, event.event_type)) {
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
    return event.event_type === "alumni_event" || Boolean(event.visible_to_alum);
  }

  return false;
}

export function canModerateAnnouncements(roles: string[]) {
  return hasAdminRole(roles) || hasPresidentOrVicePresidentRole(roles);
}

export function canCreateAnnouncements(roles: string[]) {
  return hasAdminRole(roles) || hasPresidentOrVicePresidentRole(roles);
}

export function canAccessManagement(roles: string[]) {
  return canManageMembers(roles) || canManageRoleAssignments(roles);
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

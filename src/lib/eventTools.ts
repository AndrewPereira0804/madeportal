import { getEventTypeLabel, type EventTypeSlug } from "./eventTypes";

export type EventToolDefinition = {
  eventType: EventTypeSlug;
  ownerRoleSlugs: string[];
  path: string;
  title: string;
  description: string;
  meta: string;
  pageTitle: string;
  pageSubtitle: string;
};

function getEventToolTitle(label: string) {
  if (label === "Work Party") {
    return "Work Parties";
  }

  if (label.endsWith(" Event")) {
    return `${label.slice(0, -" Event".length)} Events`;
  }

  if (label.endsWith(" Meeting")) {
    return `${label}s`;
  }

  return `${label} Events`;
}

function lowerFirst(value: string) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function eventTool(
  eventType: EventTypeSlug,
  ownerRoleSlugs: string[],
  path: string,
  description: string,
): EventToolDefinition {
  const label = getEventTypeLabel(eventType);
  const title = getEventToolTitle(label);
  return {
    eventType,
    ownerRoleSlugs,
    path,
    title,
    description,
    meta: label,
    pageTitle: title,
    pageSubtitle: `Create, edit, and delete ${lowerFirst(title)} you are permitted to manage.`,
  };
}

export const eventToolDefinitions: EventToolDefinition[] = [
  eventTool(
    "party",
    ["social-chair", "hsm", "health-safety-manager", "rec", "recorder"],
    "party-events",
    "Create party events and manage pre/post party checklists.",
  ),
  eventTool(
    "formal",
    ["social-chair", "hsm", "health-safety-manager", "rec", "recorder"],
    "formal-events",
    "Create formal events, calculate brother payments, and manage setup work.",
  ),
  eventTool(
    "sorority_fraternity",
    ["social-events", "rec", "recorder"],
    "sorority-fraternity-events",
    "Create sorority and fraternity events for the chapter calendar.",
  ),
  eventTool(
    "dei",
    ["dei-chair", "rec", "recorder"],
    "dei-events",
    "Create DEI events for the chapter calendar.",
  ),
  eventTool(
    "community_service",
    ["cs-chair", "community-service-chair", "rec", "recorder"],
    "community-service-events",
    "Create service events and track brother hours logged with Nationals.",
  ),
  eventTool(
    "philanthropy",
    ["philo-chair", "philanthropy-chair", "rec", "recorder"],
    "philanthropy-events",
    "Create philanthropy events and manage calendar details.",
  ),
  eventTool(
    "house_meeting",
    ["hm", "house-manager", "rec", "recorder"],
    "house-meetings",
    "Create house meeting events for the chapter calendar.",
  ),
  eventTool(
    "alumni_event",
    ["alumni-chair", "rec", "recorder"],
    "alumni-events",
    "Create alumni events and publish location details for alumni accounts.",
  ),
  eventTool(
    "rush",
    ["rush-chair", "rec", "recorder"],
    "rush-events",
    "Create rush events for the chapter calendar.",
  ),
  eventTool(
    "scholarship",
    ["scholarship", "rec", "recorder"],
    "scholarship-events",
    "Create scholarship events and manage calendar details.",
  ),
  eventTool(
    "professional_development",
    ["prof-dev", "rec", "recorder"],
    "professional-development-events",
    "Create professional development events and publish speaker details.",
  ),
  eventTool(
    "brotherhood_event",
    [
      "chapter-dev",
      "chapter-dev-chair",
      "chapter-development",
      "chapter-development-chair",
      "hsm",
      "health-safety-manager",
      "rec",
      "recorder",
    ],
    "brotherhood-events",
    "Create brotherhood events and manage calendar details.",
  ),
  eventTool(
    "hsm_event",
    ["hsm", "health-safety-manager", "rec", "recorder"],
    "hsm-events",
    "Create Health & Safety Manager events for the chapter calendar.",
  ),
  eventTool(
    "work_party",
    ["hm", "house-manager", "rec", "recorder"],
    "work-parties",
    "Create work party events for the chapter calendar.",
  ),
  eventTool(
    "new_member_meeting",
    ["membered", "member-educator", "rec", "recorder"],
    "new-member-meetings",
    "Create new member meetings for the chapter calendar.",
  ),
  eventTool(
    "new_member_event",
    ["membered", "member-educator", "rec", "recorder"],
    "new-member-events",
    "Create new member events for the chapter calendar.",
  ),
  eventTool(
    "other",
    ["rec", "recorder"],
    "other-events",
    "Create other events for the chapter calendar.",
  ),
];

const definitionsByEventType = new Map<EventTypeSlug, EventToolDefinition>(
  eventToolDefinitions.map((definition) => [definition.eventType, definition]),
);

export function getEventToolDefinition(eventType: EventTypeSlug) {
  return definitionsByEventType.get(eventType) ?? null;
}

export function getEventToolDefinitionsForRole(roleSlug: string) {
  const normalizedRoleSlug = roleSlug.trim().toLowerCase();
  return eventToolDefinitions.filter((definition) => definition.ownerRoleSlugs.includes(normalizedRoleSlug));
}

export function getEventToolDefinitionForRolePath(roleSlug: string, path: string) {
  const normalizedRoleSlug = roleSlug.trim().toLowerCase();
  return eventToolDefinitions.find(
    (definition) => definition.path === path && definition.ownerRoleSlugs.includes(normalizedRoleSlug),
  ) ?? null;
}

export function getPreferredEventToolOwner(definition: EventToolDefinition, roles: string[]) {
  const roleSet = new Set(roles.map((role) => role.trim().toLowerCase()).filter(Boolean));
  return definition.ownerRoleSlugs.find((roleSlug) => roleSet.has(roleSlug)) ?? definition.ownerRoleSlugs[0];
}

export function getEventToolPath(definition: EventToolDefinition, ownerRoleSlug: string) {
  return `/app/tools/${ownerRoleSlug}/${definition.path}`;
}

export function getEventToolDefinitionsForEventTypes(eventTypes: EventTypeSlug[]) {
  const eventTypeSet = new Set(eventTypes);
  return eventToolDefinitions.filter((definition) => eventTypeSet.has(definition.eventType));
}

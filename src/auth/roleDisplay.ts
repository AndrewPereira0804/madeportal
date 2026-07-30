type RoleLabelRow = {
  slug: string;
  name: string;
};

const roleLabelFallbacks: Record<string, string> = {
  admin: "Admin",
  alum: "Alumni",
  "alum-chair": "Alumni Chairman",
  alumni: "Alumni",
  "alumni-chair": "Alumni Chairman",
  "alumni-chairman": "Alumni Chairman",
  brother: "Brother",
  "chapter-dev": "Chapter Development",
  "chapter-dev-chair": "Chapter Development",
  "chapter-development": "Chapter Development",
  "chapter-development-chair": "Chapter Development",
  "cs-chair": "Community Service Chairman",
  "community-service-chair": "Community Service Chairman",
  "dei-chair": "DEI Chairman",
  ea: "President",
  eda: "Vice President",
  hm: "House Manager",
  "house-manager": "House Manager",
  hsm: "Health & Safety Manager",
  "health-safety-manager": "Health & Safety Manager",
  "membered": "Member Educator",
  "member-educator": "Member Educator",
  neophyte: "Neophyte",
  "philo-chair": "Philanthropy Chairman",
  "philanthropy-chair": "Philanthropy Chairman",
  preceptor: "Preceptor",
  "prof-dev": "Professional Development Chairman",
  rec: "Recorder",
  recorder: "Recorder",
  "rush-chair": "Rush Chairman",
  scholarship: "Scholarship Chairman",
  "social-chair": "Social Chairman",
  "social-events": "Social Events Chairman",
  stew: "Steward",
  steward: "Steward",
  treasurer: "Treasurer",
};

export function normalizeRoleSlugForDisplay(roleSlug: string) {
  return roleSlug.trim().toLowerCase();
}

export function buildRoleLabelLookup(rows: RoleLabelRow[]) {
  return rows.reduce<Record<string, string>>((lookup, role) => {
    lookup[normalizeRoleSlugForDisplay(role.slug)] = role.name;
    return lookup;
  }, {});
}

export function getRoleLabel(roleSlug: string, roleLookup: Record<string, string> = {}) {
  const normalized = normalizeRoleSlugForDisplay(roleSlug);
  if (roleLookup[normalized]) {
    return roleLookup[normalized];
  }

  if (roleLabelFallbacks[normalized]) {
    return roleLabelFallbacks[normalized];
  }

  return normalized
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

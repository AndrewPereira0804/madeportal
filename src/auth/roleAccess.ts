const memberManagerRoleSlugs = new Set(["admin", "ea", "eda"]);

export function canManageMembers(roles: string[]) {
  return roles.some((role) => memberManagerRoleSlugs.has(role));
}

const memberManagerRoleSlugs = new Set(["admin", "ea", "eda"]);
const budgetManagerRoleSlugs = new Set(["admin", "ea", "eda", "treasurer"]);

export function canManageMembers(roles: string[]) {
  return roles.some((role) => memberManagerRoleSlugs.has(role));
}

export function canManageBudgets(roles: string[]) {
  return roles.some((role) => budgetManagerRoleSlugs.has(role));
}

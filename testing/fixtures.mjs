// Fictional, disposable local accounts. This password is not a hosted credential.
export const fixturePassword = 'PortalTestOnly!2026';
export const accounts = [
  { key: 'admin', status: 'active', roles: ['brother', 'admin'] },
  { key: 'president', status: 'active', roles: ['brother', 'ea'] },
  { key: 'recorder', status: 'active', roles: ['brother', 'rec'] },
  { key: 'treasurer', status: 'active', roles: ['brother', 'treasurer'] },
  { key: 'chair', status: 'active', roles: ['brother', 'social-chair'] },
  { key: 'rush', status: 'active', roles: ['brother', 'rush-chair'] },
  { key: 'member', status: 'active', roles: ['brother'] },
  { key: 'other-member', status: 'active', roles: ['brother'] },
  { key: 'alumni', status: 'active', roles: ['alum'] },
  { key: 'neophyte', status: 'active', roles: ['neophyte'] },
  { key: 'pending', status: 'pending', roles: [] },
  { key: 'suspended', status: 'suspended', roles: [] },
].map(account => ({ ...account, email: `${account.key}@portal.test`, name: `Test ${account.key}` }));

export const recordIds = {
  announcement: '10000000-0000-4000-8000-000000000001',
  reply: '10000000-0000-4000-8000-000000000002',
  event: '10000000-0000-4000-8000-000000000003',
  meeting: '10000000-0000-4000-8000-000000000004',
  budgetCycle: '10000000-0000-4000-8000-000000000005',
  socialBudget: '10000000-0000-4000-8000-000000000006',
  rushBudget: '10000000-0000-4000-8000-000000000007',
  expense: '10000000-0000-4000-8000-000000000008',
  contact: '10000000-0000-4000-8000-000000000009',
};

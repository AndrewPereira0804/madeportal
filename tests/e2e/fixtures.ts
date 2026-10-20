import { randomUUID } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import type { BudgetTransaction } from '../../src/lib/budget';
import { localClients } from '../../testing/local-clients.mjs';
import { fixturePassword, recordIds } from '../../testing/fixtures.mjs';

type LocalDb = ReturnType<typeof localClients>;
type AccountKey = 'admin' | 'treasurer' | 'chair' | 'rush' | 'member' | 'pending' | 'suspended';
type TestData = {
  tag: string;
  userId: (key: AccountKey) => string;
  expense: (patch?: Partial<BudgetTransaction>) => Promise<BudgetTransaction>;
  expenses: () => Promise<BudgetTransaction[]>;
};

export const accountPath = (id = recordIds.socialBudget) => `/app/tools/treasurer/accounts/${id}`;
export const requestsPath = '/app/tools/treasurer/requests';
export const historyPath = '/app/tools/treasurer/history';
export const reimbursementsPath = '/app/tools/treasurer/reimbursements';

export const test = base.extend<{ data: TestData; networkGuard: void }, { localDb: LocalDb }>({
  // Node-only setup/cleanup identity. Nothing from this object enters a browser.
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
  localDb: [async ({}, provide) => { await provide(localClients()); }, { scope: 'worker' }],
  networkGuard: [async ({ context }, provide) => {
    const blocked: string[] = [], errors: string[] = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['http://127.0.0.1:5175', 'http://127.0.0.1:55431'].includes(url.origin)) await route.continue();
      // Analytics is not part of an app workflow. Keep its script inert locally.
      else if (url.origin === 'https://va.vercel-scripts.com' && /^\/v1\/script(?:\.debug)?\.js$/.test(url.pathname) && route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      }
      else {
        blocked.push(`${url.origin}${url.pathname}`);
        await route.abort('blockedbyclient');
      }
    });
    await provide();
    expect(blocked, 'The local test browser attempted an external request').toEqual([]);
    expect(errors, 'Uncaught browser errors').toEqual([]);
  }, { auto: true }],
  data: async ({ localDb }, provide, info) => {
    const tag = `E2E-${randomUUID()}`;
    const users = localDb.manifest.users as { key: string; id: string }[];
    const userId = (key: AccountKey) => {
      const user = users.find(candidate => candidate.key === key);
      if (!user) throw new Error(`Missing local fixture ${key}`);
      return user.id;
    };
    const expenses = async () => {
      const result = await localDb.admin.from('budget_transactions').select('*').like('vendor', `${tag}%`);
      expect(result.error).toBeNull();
      return result.data as BudgetTransaction[];
    };
    info.annotations.push({ type: 'local-fixture', description: tag });
    try {
      await provide({ tag, userId, expenses, expense: async (patch = {}) => {
        const status = patch.status ?? 'submitted';
        const result = await localDb.admin.from('budget_transactions').insert({
          budget_account_id: recordIds.socialBudget, submitted_by: userId('chair'), amount: 42.23,
          vendor: tag, description: `${tag} browser expense`, category: 'Supplies', transaction_date: '2027-01-04',
          status, is_house_card: false,
          ...(status !== 'submitted' ? { approved_by: userId('treasurer'), approved_at: '2026-10-20T12:00:00Z' } : {}),
          ...patch,
        }).select('*').single();
        expect(result.error).toBeNull();
        return result.data as BudgetTransaction;
      } });
    } finally {
      const result = await localDb.admin.from('budget_transactions').delete().like('vendor', `${tag}%`);
      expect(result.error, 'Could not clean up the disposable browser expense').toBeNull();
      expect(await expenses()).toEqual([]);
    }
  },
});

export { expect };

export async function login(page: Page, key: AccountKey, destination = '/app') {
  await page.goto(destination);
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(`${key}@portal.test`);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${key === 'pending' ? '/pending' : key === 'suspended' ? '/suspended' : destination}$`));
}

export function requestCard(page: Page, vendor: string) {
  // These existing cards have no listitem role. Scope by their visible vendor.
  return page.locator('.budget-request-card').filter({ hasText: vendor });
}

export function expenseRow(page: Page, vendor: string) {
  return page.getByRole('row').filter({ hasText: vendor });
}

export function metric(page: Page, label: string) {
  return page.getByLabel('Budget summary', { exact: true }).locator('.ui-metric-card')
    .filter({ has: page.getByText(label, { exact: true }) });
}

export async function fillExpense(page: Page, vendor: string, amount = '42.23') {
  await page.getByLabel('Amount', { exact: true }).fill(amount);
  await page.getByLabel('Transaction date', { exact: true }).fill('2027-01-04');
  await page.getByLabel('Vendor', { exact: true }).fill(vendor);
  await page.getByLabel('Category', { exact: true }).selectOption('Supplies');
  await page.getByLabel('Description', { exact: true }).fill(`${vendor} browser expense`);
}

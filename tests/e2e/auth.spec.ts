import { test, expect, login, accountPath, requestsPath } from './fixtures';
import { recordIds } from '../../testing/fixtures.mjs';

test('signed-out visitors must log in before opening a protected page', async ({ page }) => {
  await page.goto('/app/manage/members');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
});

test('invalid credentials show a useful error and do not enter the app', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('member@portal.test');
  await page.getByLabel('Password', { exact: true }).fill('IncorrectFixturePassword');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText(/Login failed: Invalid login credentials/)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('member login persists across reload; logout closes protected routes', async ({ page }) => {
  await login(page, 'member');
  await expect(page.getByRole('heading', { name: 'Welcome, Test member', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome, Test member', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login$/);
});

for (const key of ['pending', 'suspended'] as const) {
  test(`${key} users remain on their restricted screen when opening protected routes`, async ({ page }) => {
    await login(page, key);
    const heading = key === 'pending' ? 'Access pending' : 'Access suspended';
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    for (const path of ['/app/manage/members', requestsPath, '/app/directory']) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/${key}$`));
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    }
  });
}

test('ordinary members cannot open member management or treasurer tools', async ({ page }) => {
  await login(page, 'member');
  await expect(page.getByRole('link', { name: /Management/ })).toHaveCount(0);
  for (const { path, destination, heading } of [
    { path: '/app/manage/members', destination: /\/app$/, heading: 'Welcome, Test member' },
    { path: requestsPath, destination: /\/app\/tools$/, heading: 'No chair tools assigned' },
    { path: accountPath(), destination: /\/app\/tools$/, heading: 'No chair tools assigned' },
  ]) {
    await test.step(`Deny ${path}`, async () => {
      await page.goto(path);
      await expect(page).toHaveURL(destination);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Submit expense', exact: true })).toHaveCount(0);
    });
  }
});

test('chair permissions resolve before a nested budget screen is mounted', async ({ page }) => {
  await login(page, 'member');
  await expect(page.getByRole('heading', { name: 'Welcome, Test member', exact: true })).toBeVisible();
  let releaseRoles!: () => void;
  let reportHeldRequest!: () => void;
  const roleGate = new Promise<void>(resolve => { releaseRoles = resolve; });
  const heldRequest = new Promise<void>(resolve => { reportHeldRequest = resolve; });
  let roleRequests = 0;
  await page.route('http://127.0.0.1:55431/rest/v1/user_roles?*', async route => {
    // Let the app-level access check finish, then hold the nested role reads.
    // Real responses are delayed; their data and authorization are unchanged.
    if (++roleRequests > 1) {
      reportHeldRequest();
      await roleGate;
    }
    await route.continue();
  });
  try {
    await page.goto(accountPath());
    await heldRequest;
    await expect(page).toHaveURL(new RegExp(`${accountPath()}$`));
    await expect(page.getByText('Loading chair tools...', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Budget account', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Submit expense', exact: true })).toHaveCount(0);
  } finally {
    releaseRoles();
  }
  await expect(page).toHaveURL(/\/app\/tools$/);
  await expect(page.getByRole('heading', { name: 'No chair tools assigned', exact: true })).toBeVisible();
});

test('a chair can open their own budget but cannot read another chair’s account', async ({ page }) => {
  await login(page, 'chair', accountPath());
  await expect(page.getByRole('heading', { name: 'social-chair', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit expense', exact: true })).toBeVisible();
  await page.goto(accountPath(recordIds.rushBudget));
  await expect(page.getByText('Account unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit expense', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'rush-chair', exact: true })).toHaveCount(0);
});

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
  for (const path of ['/app/manage/members', requestsPath, accountPath()]) {
    await page.goto(path);
    await expect(page).toHaveURL(path === requestsPath ? /\/app\/tools$/ : /\/app$/);
    await expect(page.getByRole('heading', { name: path === requestsPath ? 'No chair tools assigned' : 'Welcome, Test member', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  }
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

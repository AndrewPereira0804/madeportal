import { test, expect, login } from './fixtures';

test('published wait-on weeks follow the URL through changes, history, and reload', async ({ page }) => {
  await login(page, 'member');
  await page.goto('/app/wait-ons?week=2035-01-01');
  const week = page.getByLabel('Week of', { exact: true });
  const empty = page.getByText('No published wait-on form', { exact: true });
  await expect(week).toHaveValue('2035-01-01');
  await expect(week).toBeEnabled();
  await expect(empty).toBeVisible();

  // A midweek selection normalizes to Monday in both the input and URL.
  await week.fill('2035-01-10');
  await expect(page).toHaveURL(/\/app\/wait-ons\?week=2035-01-08$/);
  await expect(week).toHaveValue('2035-01-08');
  await expect(week).toBeEnabled();
  await expect(empty).toBeVisible();

  await page.goBack();
  await expect(week).toHaveValue('2035-01-01');
  await expect(week).toBeEnabled();
  await expect(empty).toBeVisible();
  await page.goForward();
  await expect(week).toHaveValue('2035-01-08');
  await expect(week).toBeEnabled();
  await page.reload();
  await expect(week).toHaveValue('2035-01-08');
  await expect(week).toBeEnabled();
  await expect(empty).toBeVisible();
});

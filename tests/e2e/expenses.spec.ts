import { test, expect, login, accountPath, requestsPath, historyPath, reimbursementsPath, expenseRow, requestCard, metric, fillExpense } from './fixtures';

test('a submitter creates, edits, cancels deletion, and deletes a submitted expense', async ({ page, data }) => {
  await login(page, 'chair', accountPath());
  await fillExpense(page, data.tag);
  await page.getByRole('button', { name: 'Submit expense', exact: true }).click();
  const row = expenseRow(page, data.tag);
  await expect(row).toContainText('$42.23');
  await expect(row).toContainText('Submitted');
  await expect.poll(async () => (await data.expenses()).length).toBe(1);
  expect((await data.expenses())[0].submitted_by).toBe(data.userId('chair'));
  await expect(metric(page, 'Pending')).toContainText('$67.23');
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit submitted expense' })).toBeVisible();
  await page.getByLabel('Amount', { exact: true }).fill('50.50');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(row).toContainText('$50.50');
  await expect(metric(page, 'Pending')).toContainText('$75.50');
  page.once('dialog', dialog => dialog.dismiss());
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row).toBeVisible();
  expect((await data.expenses()).length).toBe(1);
  page.once('dialog', dialog => dialog.accept());
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect.poll(async () => (await data.expenses()).length).toBe(0);
  await expect(metric(page, 'Pending')).toContainText('$25.00');
});

test('expense validation prevents incomplete or zero-value submissions', async ({ page, data }) => {
  await login(page, 'chair', accountPath());
  await page.getByRole('button', { name: 'Submit expense', exact: true }).click();
  await expect(page.getByText('Amount must be greater than 0.', { exact: true })).toBeVisible();
  await fillExpense(page, data.tag, '0');
  await page.getByRole('button', { name: 'Submit expense', exact: true }).click();
  await expect(page.getByText('Amount must be greater than 0.', { exact: true })).toBeVisible();
  expect(await data.expenses()).toEqual([]);
});

test('approval requires confirmation; cancelling/Escape do not approve; approved details are locked', async ({ page, data }) => {
  await data.expense();
  await login(page, 'treasurer', requestsPath);
  const card = requestCard(page, data.tag);
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm expense approval' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('$42.23');
  await expect(dialog).toContainText(data.tag);
  await expect(dialog).toContainText('2027-01-04');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await data.expenses())[0].status).toBe('submitted');
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect((await data.expenses())[0].status).toBe('submitted');
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await dialog.getByRole('button', { name: 'Approve expense', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect.poll(async () => (await data.expenses())[0].status).toBe('approved');
  expect((await data.expenses())[0].approved_by).toBe(data.userId('treasurer'));
  await page.goto(accountPath());
  const row = expenseRow(page, data.tag);
  await expect(row).toContainText('Approved');
  await expect(row.getByRole('button', { name: /Edit|Delete/ })).toHaveCount(0);
});

test('approved expenses require a nonblank void reason and remain in history outside spending totals', async ({ page, data }) => {
  await data.expense({ status: 'approved' });
  await login(page, 'treasurer', accountPath());
  await expect(metric(page, 'Approved / reimbursed')).toContainText('$42.23');
  await page.goto(historyPath);
  const card = requestCard(page, data.tag);
  await card.getByRole('button', { name: 'Void expense', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Void approved expense' });
  const confirm = dialog.getByRole('button', { name: 'Void expense', exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Reason for voiding').fill('   ');
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await data.expenses())[0].status).toBe('approved');
  await card.getByRole('button', { name: 'Void expense', exact: true }).click();
  await dialog.getByLabel('Reason for voiding').fill('  Duplicate receipt  ');
  await confirm.click();
  await expect(card).toContainText('Voided');
  await expect(card).toContainText('Duplicate receipt');
  await expect(card.getByRole('button')).toHaveCount(0);
  const saved = (await data.expenses())[0];
  expect(saved.void_reason).toBe('Duplicate receipt');
  expect(saved.voided_by).toBe(data.userId('treasurer'));
  expect(saved.approved_by).toBe(data.userId('treasurer'));
  await page.goto(accountPath());
  await expect(expenseRow(page, data.tag)).toContainText('Voided');
  await expect(metric(page, 'Approved / reimbursed')).toContainText('$0.00');
  await expect(metric(page, 'Remaining')).toContainText('$975.00');
});

test('reimbursement removes the payout action and leaves the retained expense locked', async ({ page, data }) => {
  await data.expense({ status: 'approved' });
  await login(page, 'treasurer', reimbursementsPath);
  const card = requestCard(page, data.tag);
  await card.getByRole('button', { name: 'Mark Reimbursed', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect.poll(async () => (await data.expenses())[0].status).toBe('reimbursed');
  await page.goto(historyPath);
  await expect(card).toContainText('Reimbursed');
  await expect(card.getByRole('button')).toHaveCount(0);
  await page.goto(accountPath());
  await expect(expenseRow(page, data.tag)).toContainText('Reimbursed');
  await expect(expenseRow(page, data.tag).getByRole('button')).toHaveCount(0);
});

test('House Card submissions do not enter the reimbursement queue', async ({ page, data }) => {
  await login(page, 'chair', accountPath());
  await fillExpense(page, data.tag);
  await page.getByRole('button', { name: 'House Card', exact: true }).click();
  await expect(page.getByRole('button', { name: 'House Card', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Submit expense', exact: true }).click();
  await expect(expenseRow(page, data.tag)).toContainText('House Card');
  expect((await data.expenses())[0].is_house_card).toBe(true);
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, 'treasurer', requestsPath);
  await requestCard(page, data.tag).getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('dialog', { name: 'Confirm expense approval' }).getByRole('button', { name: 'Approve expense', exact: true }).click();
  await expect(requestCard(page, data.tag)).toHaveCount(0);
  await page.goto(reimbursementsPath);
  await expect(requestCard(page, data.tag)).toHaveCount(0);
  await page.goto(historyPath);
  await expect(requestCard(page, data.tag)).toContainText('Approved');
  await expect(requestCard(page, data.tag)).toContainText('House Card');
});

test('an expense edited after the approval popup opens cannot be approved from the stale review', async ({ page, context, data }) => {
  await data.expense();
  await login(page, 'treasurer', requestsPath);
  await requestCard(page, data.tag).getByRole('button', { name: 'Approve', exact: true }).click();
  // A second real browser page edits through the manager UI using the same session.
  const editor = await context.newPage();
  await editor.goto(requestsPath);
  await requestCard(editor, data.tag).getByRole('button', { name: 'Edit', exact: true }).click();
  await editor.getByLabel('Amount', { exact: true }).fill('99.99');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(requestCard(editor, data.tag)).toContainText('$99.99');
  await page.getByRole('dialog', { name: 'Confirm expense approval' }).getByRole('button', { name: 'Approve expense', exact: true }).click();
  await expect(page.getByText(/already changed|no longer available/)).toBeVisible();
  const saved = (await data.expenses())[0];
  expect(saved.status).toBe('submitted');
  expect(Number(saved.amount)).toBe(99.99);
  await editor.close();
});

test('the approval popup remains usable at a mobile viewport', async ({ page, data }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await data.expense();
  await login(page, 'treasurer', requestsPath);
  await requestCard(page, data.tag).getByRole('button', { name: 'Approve', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm expense approval' });
  await expect(dialog).toBeInViewport({ ratio: 0.9 });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await data.expenses())[0].status).toBe('submitted');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { localClients } from '../local-clients.mjs';
import { accounts, fixturePassword, recordIds } from '../fixtures.mjs';
import { calculateBudgetSummary } from '../../src/lib/budget.ts';
import { permissionDenied } from './helpers.mjs';

test('expense RLS and lifecycle through the real local Supabase API', async t => {
  const { admin, client, manifest } = localClients();
  const users = Object.fromEntries(manifest.users.map(user => [user.key, user]));
  const signedIn = {};
  const created = new Set();
  const cycles = new Set(), budgets = new Set();
  const ok = result => { assert.equal(result.error, null, result.error?.message); return result.data; };
  const read = async id => ok(await admin.from('budget_transactions').select('*').eq('id', id).single());
  async function expense(input = {}) {
    const status = input.status || 'submitted';
    const row = ok(await admin.from('budget_transactions').insert({
      budget_account_id: recordIds.socialBudget, submitted_by: users.chair.id, amount: 25,
      category: 'Supplies', vendor: 'RLS Test Vendor', description: 'Disposable RLS test expense',
      transaction_date: '2027-01-04', status,
      ...(status !== 'submitted' ? { approved_by: users.treasurer.id, approved_at: '2026-10-20T12:00:00Z' } : {}),
      ...input,
    }).select('*').single());
    created.add(row.id);
    return row;
  }
  async function deniedUpdate(actor, row, patch, expectedCode = '42501') {
    const before = await read(row.id);
    const result = await actor.from('budget_transactions').update(patch, { count: 'exact' }).eq('id', row.id);
    if (expectedCode !== '42501') assert.ok(result.error, 'Expected the explicit lifecycle validation error');
    if (result.error) assert.equal(result.error.code, expectedCode, result.error.message);
    else assert.equal(result.count, 0, 'Unauthorized update unexpectedly succeeded');
    assert.deepEqual(await read(row.id), before, 'Denied update changed the record');
  }
  async function deniedDelete(actor, row) {
    const before = await read(row.id);
    const result = await actor.from('budget_transactions').delete({ count: 'exact' }).eq('id', row.id);
    if (result.error) permissionDenied(result);
    else assert.equal(result.count, 0, 'Retained expense was deleted');
    assert.deepEqual(await read(row.id), before);
  }
  try {
    for (const account of accounts) {
      signedIn[account.key] = client();
      const login = ok(await signedIn[account.key].auth.signInWithPassword({ email: account.email, password: fixturePassword }));
      assert.equal(login.user.id, users[account.key].id, 'Fixture manifest is stale; finish test:env:reset before running RLS tests.');
    }
    await t.test('submitter can submit with default IDs and cannot impersonate another submitter', async () => {
      const payload = { budget_account_id: recordIds.socialBudget, submitted_by: users.chair.id, amount: 10, description: 'Owner submission', status: 'submitted' };
      const row = ok(await signedIn.chair.from('budget_transactions').insert(payload).select('*').single());
      created.add(row.id);
      assert.equal(row.approved_by, null);
      assert.equal(row.voided_by, null);
      assert.ok((await signedIn.chair.from('budget_transactions').insert({ ...payload, submitted_by: users.member.id })).error);
    });
    await t.test('insert cannot skip review or forge approval metadata', async () => {
      const base = { budget_account_id: recordIds.socialBudget, submitted_by: users.chair.id, amount: 10, description: 'Forged approval' };
      for (const payload of [{ status: 'approved' }, { status: 'voided' }, { status: 'submitted', approved_by: users.admin.id }]) {
        assert.ok((await signedIn.chair.from('budget_transactions').insert({ ...base, ...payload })).error);
      }
      assert.ok((await signedIn.admin.from('budget_transactions').insert({ ...base, submitted_by: users.admin.id, status: 'approved' })).error);
    });
    await t.test('submitter can edit and delete a submitted expense', async () => {
      const row = await expense();
      const edited = ok(await signedIn.chair.from('budget_transactions').update({ amount: 40, vendor: 'Corrected Vendor' }).eq('id', row.id).select('*').single());
      assert.equal(Number(edited.amount), 40);
      assert.notEqual(edited.updated_at, row.updated_at);
      assert.equal(ok(await signedIn.chair.from('budget_transactions').delete().eq('id', row.id).select('id')).length, 1);
    });
    await t.test('active submitter retains control of their own submission without the budget role', async () => {
      const row = await expense({ submitted_by: users.member.id });
      assert.equal(ok(await signedIn.member.from('budget_transactions').update({ amount: 35 }).eq('id', row.id).select('id')).length, 1);
      assert.equal(ok(await signedIn.member.from('budget_transactions').delete().eq('id', row.id).select('id')).length, 1);
    });
    await t.test('a peer with the same budget access cannot edit or delete another submitter’s expense', async () => {
      ok(await admin.from('user_roles').insert({ user_id: users['other-member'].id, role_slug: 'social-chair' }));
      const row = await expense();
      assert.equal(ok(await signedIn['other-member'].from('budget_transactions').select('id').eq('id', row.id)).length, 1);
      await deniedUpdate(signedIn['other-member'], row, { amount: 999 });
      await deniedDelete(signedIn['other-member'], row);
    });
    for (const actor of ['pending', 'suspended', 'recorder', 'rush']) {
      await t.test(`${actor} cannot modify another person’s submitted expense`, async () => {
        const row = await expense();
        await deniedUpdate(signedIn[actor], row, { amount: 999 });
        await deniedDelete(signedIn[actor], row);
        if (actor === 'pending' || actor === 'suspended') assert.deepEqual(ok(await signedIn[actor].from('budget_transactions').select('id').eq('id', row.id)), []);
      });
    }
    for (const actor of ['pending', 'suspended']) {
      await t.test(`${actor} cannot change even an expense submitted under their own ID`, async () => {
        const row = await expense({ submitted_by: users[actor].id });
        await deniedUpdate(signedIn[actor], row, { amount: 999 });
        await deniedDelete(signedIn[actor], row);
      });
    }
    await t.test('signed-out requests cannot read or write expenses', async () => {
      const row = await expense();
      const anonymous = client();
      const result = await anonymous.from('budget_transactions').select('id').eq('id', row.id);
      assert.ok(result.error || result.data.length === 0);
      await deniedUpdate(anonymous, row, { amount: 999 });
      await deniedDelete(anonymous, row);
    });
    for (const actor of ['admin', 'president', 'treasurer']) {
      await t.test(`${actor} can edit/delete submitted expenses and approve with server audit fields`, async () => {
        const row = await expense();
        ok(await signedIn[actor].from('budget_transactions').update({ amount: 30 }).eq('id', row.id));
        const approved = ok(await signedIn[actor].from('budget_transactions').update({ status: 'approved' }).eq('id', row.id).select('*').single());
        assert.equal(approved.approved_by, users[actor].id);
        assert.ok(approved.approved_at);
        assert.equal(Number(approved.amount), 30);
        const removable = await expense();
        assert.equal(ok(await signedIn[actor].from('budget_transactions').delete().eq('id', removable.id).select('id')).length, 1);
      });
    }
    await t.test('vice president (eda), without president authority, can manage submitted expenses', async () => {
      ok(await admin.from('user_roles').delete().eq('user_id', users.president.id).eq('role_slug', 'ea'));
      try {
        ok(await admin.from('user_roles').insert({ user_id: users.president.id, role_slug: 'eda' }));
        const row = await expense();
        ok(await signedIn.president.from('budget_transactions').update({ amount: 31 }).eq('id', row.id));
        assert.equal(ok(await signedIn.president.from('budget_transactions').update({ status: 'approved' }).eq('id', row.id).select('*').single()).approved_by, users.president.id);
        await deniedDelete(signedIn.president, row);
      } finally {
        ok(await admin.from('user_roles').delete().eq('user_id', users.president.id).eq('role_slug', 'eda'));
        ok(await admin.from('user_roles').upsert({ user_id: users.president.id, role_slug: 'ea' }));
      }
    });
    await t.test('submitter cannot approve themselves or change ownership/account/audit fields', async () => {
      const row = await expense();
      for (const patch of [{ status: 'approved' }, { submitted_by: users.admin.id }, { budget_account_id: recordIds.rushBudget }, { approved_at: new Date().toISOString() }, { updated_at: '2000-01-01' }]) await deniedUpdate(signedIn.chair, row, patch);
    });
    await t.test('approval cannot be combined with changes to the reviewed details', async () => {
      await deniedUpdate(signedIn.treasurer, await expense(), { status: 'approved', amount: 500 });
    });
    await t.test('a budget manager cannot forge approval or void attribution', async () => {
      const row = await expense();
      await deniedUpdate(signedIn.treasurer, row, { approved_by: users.admin.id });
      await deniedUpdate(signedIn.treasurer, row, { voided_by: users.admin.id });
    });
    await t.test('stale approval cannot approve an expense edited after it was reviewed', async () => {
      const row = await expense();
      ok(await signedIn.chair.from('budget_transactions').update({ amount: 51 }).eq('id', row.id));
      const result = ok(await signedIn.treasurer.from('budget_transactions').update({ status: 'approved' }).eq('id', row.id).eq('updated_at', row.updated_at).select('id'));
      assert.equal(result.length, 0);
      assert.equal((await read(row.id)).status, 'submitted');
    });
    await t.test('concurrent edit and approval using the same version cannot both succeed', async () => {
      const row = await expense();
      const results = await Promise.all([
        signedIn.chair.from('budget_transactions').update({ amount: 55 }).eq('id', row.id).eq('updated_at', row.updated_at).select('id'),
        signedIn.treasurer.from('budget_transactions').update({ status: 'approved' }).eq('id', row.id).eq('updated_at', row.updated_at).select('id'),
      ]);
      assert.equal(results.reduce((count, result) => count + (result.data?.length || 0), 0), 1);
      const current = await read(row.id);
      if (current.status === 'approved') assert.equal(Number(current.amount), 25);
      else { assert.equal(current.status, 'submitted'); assert.equal(Number(current.amount), 55); }
    });
    for (const actor of ['chair', 'admin', 'president', 'treasurer']) {
      await t.test(`${actor} cannot delete, edit, or reopen an approved expense`, async () => {
        const row = await expense({ status: 'approved' });
        await deniedDelete(signedIn[actor], row);
        for (const patch of [{ amount: 999 }, { vendor: 'Changed' }, { status: 'submitted' }]) await deniedUpdate(signedIn[actor], row, patch);
      });
    }
    await t.test('only budget managers may void; a reason and original approval are preserved', async () => {
      const row = await expense({ status: 'approved' });
      await deniedUpdate(signedIn.chair, row, { status: 'voided', void_reason: 'Not allowed' });
      await deniedUpdate(signedIn.treasurer, row, { status: 'voided', void_reason: '  ' }, 'P0001');
      const voided = ok(await signedIn.treasurer.from('budget_transactions').update({ status: 'voided', void_reason: '  Duplicate entry  ' }).eq('id', row.id).select('*').single());
      assert.equal(voided.void_reason, 'Duplicate entry');
      assert.equal(voided.voided_by, users.treasurer.id);
      assert.ok(voided.voided_at);
      assert.equal(voided.approved_by, row.approved_by);
      assert.equal(voided.approved_at, row.approved_at);
      assert.equal(Number(voided.amount), 25);
      await deniedDelete(signedIn.admin, voided);
      await deniedUpdate(signedIn.admin, voided, { status: 'approved' });
      await deniedUpdate(signedIn.admin, voided, { void_reason: 'Rewrite history' });
    });
    await t.test('approved personal expenses can be reimbursed; reimbursement is then locked', async () => {
      const row = await expense({ status: 'approved' });
      const reimbursed = ok(await signedIn.treasurer.from('budget_transactions').update({ status: 'reimbursed' }).eq('id', row.id).select('*').single());
      for (const actor of ['admin', 'treasurer', 'chair']) {
        await deniedDelete(signedIn[actor], reimbursed);
        await deniedUpdate(signedIn[actor], reimbursed, { status: 'voided', void_reason: 'Already paid' });
        await deniedUpdate(signedIn[actor], reimbursed, { amount: 0.01 });
      }
    });
    await t.test('House Card expenses can be voided but cannot be reimbursed', async () => {
      const row = await expense({ status: 'approved', is_house_card: true });
      await deniedUpdate(signedIn.treasurer, row, { status: 'reimbursed' }, 'P0001');
      assert.equal(ok(await signedIn.treasurer.from('budget_transactions').update({ status: 'voided', void_reason: 'Duplicate card charge entry' }).eq('id', row.id).select('*').single()).status, 'voided');
    });
    await t.test('deleting a budget account or cycle cannot cascade away financial history', async () => {
      const cycle = ok(await admin.from('budget_cycles').insert({ name: 'RLS retention test', start_date: '2026-01-01', end_date: '2026-12-31' }).select('*').single());
      cycles.add(cycle.id);
      const budget = ok(await admin.from('budget_accounts').insert({ cycle_id: cycle.id, role_slug: 'social-chair' }).select('*').single());
      budgets.add(budget.id);
      const row = await expense({ status: 'approved', budget_account_id: budget.id });
      assert.ok((await signedIn.admin.from('budget_accounts').delete().eq('id', budget.id)).error);
      assert.ok((await signedIn.admin.from('budget_cycles').delete().eq('id', cycle.id)).error);
      assert.equal((await read(row.id)).status, 'approved');
    });
    await t.test('voided expenses leave budget spending and pending totals without erasing history', () => {
      const summary = calculateBudgetSummary([{ allocated_amount: 100 }], [
        { status: 'submitted', amount: 10 }, { status: 'approved', amount: 20 },
        { status: 'reimbursed', amount: 30 }, { status: 'voided', amount: 40 },
      ]);
      assert.deepEqual(summary, { allocated: 100, pending: 10, spent: 50, remaining: 40 });
    });
  } finally {
    if (created.size) ok(await admin.from('budget_transactions').delete().in('id', [...created]));
    if (budgets.size) ok(await admin.from('budget_accounts').delete().in('id', [...budgets]));
    if (cycles.size) ok(await admin.from('budget_cycles').delete().in('id', [...cycles]));
    ok(await admin.from('user_roles').delete().eq('user_id', users['other-member'].id).eq('role_slug', 'social-chair'));
    await Promise.all(Object.values(signedIn).map(actor => actor.auth.signOut()));
  }
});

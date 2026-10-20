import { accounts, fixturePassword, recordIds as ids } from './fixtures.mjs';

function checked(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

export async function seedFixtures(admin) {
  const existing = checked(await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }), 'List local users').users;
  const allowedEmails = new Set(accounts.map(account => account.email));
  if (existing.some(user => !allowedEmails.has(user.email))) throw new Error('Unexpected users in the disposable test database; inspect it before resetting.');
  const manifest = [];
  for (const account of accounts) {
    let user = existing.find(candidate => candidate.email === account.email);
    if (!user) user = checked(await admin.auth.admin.createUser({ email: account.email, password: fixturePassword, email_confirm: true, user_metadata: { name: account.name } }), `Create ${account.key}`).user;
    if (account.roles.length) checked(await admin.from('user_roles').upsert(account.roles.map(role_slug => ({ user_id: user.id, role_slug })), { onConflict: 'user_id,role_slug' }), `Roles for ${account.key}`);
    checked(await admin.from('profiles').update({ name: account.name, status: account.status, major: 1, hometown: 'Fixture Town' }).eq('user_id', user.id), `Profile for ${account.key}`);
    manifest.push({ ...account, id: user.id });
  }
  const user = key => manifest.find(account => account.key === key).id;
  async function upsert(table, data) { checked(await admin.from(table).upsert(data), `Seed ${table}`); }
  await upsert('calendars', { id: 1, name: 'Test calendar', start: '2026-08-01', end: '2027-07-31' });
  await upsert('announcements', { id: ids.announcement, author_id: user('admin'), title: 'Test announcement', body: 'Fictional local test data.', visibility: 'active' });
  await upsert('announcement_replies', { id: ids.reply, announcement_id: ids.announcement, author_id: user('member'), body: 'Test reply' });
  await upsert('events', [
    { id: ids.event, created_by: user('chair'), title: 'Test social event', start: '2027-01-05T18:00:00', end: '2027-01-05T20:00:00', event_type: 'party', event_tags: ['party'], visible_to_alum: false, visible_to_neophyte: false },
    { id: ids.meeting, created_by: user('admin'), title: 'Test house meeting', start: '2027-01-06T18:00:00', end: '2027-01-06T19:00:00', event_type: 'house_meeting', event_tags: ['house_meeting'], visible_to_alum: true, visible_to_neophyte: true },
  ]);
  await upsert('budget_cycles', { id: ids.budgetCycle, name: 'Test budget cycle', start_date: '2026-08-01', end_date: '2027-07-31', is_active: true, created_by: user('treasurer') });
  await upsert('budget_accounts', [
    { id: ids.socialBudget, cycle_id: ids.budgetCycle, role_slug: 'social-chair', allocated_amount: 1000, created_by: user('treasurer') },
    { id: ids.rushBudget, cycle_id: ids.budgetCycle, role_slug: 'rush-chair', allocated_amount: 500, created_by: user('treasurer') },
  ]);
  await upsert('budget_transactions', { id: ids.expense, budget_account_id: ids.socialBudget, submitted_by: user('chair'), amount: 25, vendor: 'Fixture Vendor', category: 'Supplies', description: 'Test expense', transaction_date: '2027-01-04', status: 'submitted', is_house_card: false, approved_by: null, approved_at: null, voided_by: null, voided_at: null, void_reason: null });
  await upsert('emergency_contacts', { id: ids.contact, user_id: user('member'), contact_type: 'guardian', name: 'Test Guardian', phone: '202-555-0100' });
  return manifest;
}

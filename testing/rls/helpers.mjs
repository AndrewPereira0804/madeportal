import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { accounts, fixturePassword, recordIds } from '../fixtures.mjs';
import { localClients } from '../local-clients.mjs';

export const ok = result => {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
};

// A broken request (missing column, bad JSON, invalid FK, etc.) is not evidence
// of an authorization boundary. Denials must be 42501 or a verified empty result.
export function permissionDenied(result) {
  assert.ok(result.error, 'Unauthorized request unexpectedly succeeded');
  assert.equal(result.error.code, '42501', result.error.message);
}

export async function applicationContext() {
  const { admin, client, manifest } = localClients();
  const users = Object.fromEntries(manifest.users.map(user => [user.key, user]));
  const actors = { anonymous: client() };
  const created = new Map();
  const tag = `RLS ${randomUUID()}`;
  const match = (query, filter) => query.match(filter);
  const snapshot = async (table, filter) => ok(await match(admin.from(table).select('*'), filter))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const profiles = ok(await admin.from('profiles').select('*').in('user_id', manifest.users.map(user => user.id)));
  const originalRoles = ok(await admin.from('user_roles').select('*').in('user_id', manifest.users.map(user => user.id)));

  function track(table, rows) {
    if (['profiles', 'user_roles'].includes(table)) return;
    if (!created.has(table)) created.set(table, new Set());
    for (const row of rows || []) {
      if (table === 'roles') created.get(table).add(row.slug);
      else if (row.id !== undefined) created.get(table).add(row.id);
    }
  }
  async function insert(actor, table, payload) {
    const result = await actor.from(table).insert(payload).select('*');
    track(table, result.data);
    return result;
  }
  async function make(table, payload, actor = admin) {
    const rows = ok(await insert(actor, table, payload));
    assert.equal(rows.length, 1);
    return rows[0];
  }
  async function hidden(actor, table, filter = {}) {
    const result = await match(actor.from(table).select('*'), filter);
    if (result.error) permissionDenied(result);
    else assert.deepEqual(result.data, [], `${table} leaked rows`);
  }
  async function deniedChange(actor, table, filter, patch) {
    const before = await snapshot(table, filter);
    assert.ok(before.length > 0, 'A denied mutation must target an existing fixture');
    // Minimal responses isolate write authorization from SELECT/RETURNING rules.
    const query = patch === undefined ? actor.from(table).delete({ count: 'exact' }) : actor.from(table).update(patch, { count: 'exact' });
    const result = await match(query, filter);
    if (result.error) permissionDenied(result);
    else assert.equal(result.count, 0, `Unauthorized ${table} mutation succeeded`);
    assert.deepEqual(await snapshot(table, filter), before, 'Denied mutation changed the stored data');
  }
  async function deniedInsert(actor, table, payload) {
    const before = await snapshot(table, {});
    const result = await actor.from(table).insert(payload);
    const after = await snapshot(table, {});
    const original = new Set(before.map(row => JSON.stringify(row)));
    track(table, after.filter(row => !original.has(JSON.stringify(row))));
    permissionDenied(result);
    assert.deepEqual(after, before, 'Denied insert changed the stored data');
  }
  async function roleScope(key, slugs, fn) {
    const user_id = users[key].id;
    const previous = ok(await admin.from('user_roles').select('role_slug').eq('user_id', user_id)).map(row => row.role_slug);
    const additions = slugs.filter(slug => !previous.includes(slug));
    try {
      if (additions.length) ok(await admin.from('user_roles').insert(additions.map(role_slug => ({ user_id, role_slug }))));
      return await fn(actors[key]);
    } finally {
      if (additions.length) ok(await admin.from('user_roles').delete().eq('user_id', user_id).in('role_slug', additions));
    }
  }
  const eventPayload = (key = 'admin', type = 'house_meeting', extra = {}) => ({
    created_by: users[key].id, title: tag, start: '2027-03-01T18:00:00', end: '2027-03-01T20:00:00',
    event_type: type, event_tags: [type], details: {}, visible_to_alum: type === 'alumni_event', visible_to_neophyte: false, ...extra,
  });
  const announcementPayload = (key = 'chair', extra = {}) => ({ author_id: users[key].id, title: tag, body: tag, visibility: 'active', ...extra });
  const contactPayload = (key = 'member', extra = {}) => ({ user_id: users[key].id, contact_type: 'guardian', name: tag, phone: '202-555-0199', ...extra });

  // Register cleanup before login so a partially failed setup can still sign out.
  async function cleanup() {
    const failures = [];
    const attempt = async fn => { try { await fn(); } catch (error) { failures.push(error); } };
    for (const table of ['event_attendance', 'announcement_replies', 'announcement_likes', 'budget_transactions', 'wait_on_assignments', 'wait_on_schedules', 'emergency_contacts', 'events', 'announcements', 'calendars', 'budget_accounts', 'budget_cycles', 'audit_log', 'transactions', 'roles', 'majors']) {
      const ids = [...(created.get(table) || [])];
      if (ids.length) await attempt(async () => ok(await admin.from(table).delete().in(table === 'roles' ? 'slug' : 'id', ids)));
    }
    // Restore roles before reactivating, and deactivate inactive originals before
    // dropping roles. This respects the real deferred app-access-role constraint.
    for (const profile of profiles) {
      await attempt(async () => {
        const roles = originalRoles.filter(row => row.user_id === profile.user_id);
        if (roles.length) ok(await admin.from('user_roles').upsert(roles));
        ok(await admin.from('profiles').upsert(profile));
        const expected = roles.map(row => row.role_slug);
        const current = ok(await admin.from('user_roles').select('role_slug').eq('user_id', profile.user_id));
        for (const row of current.filter(row => !expected.includes(row.role_slug))) ok(await admin.from('user_roles').delete().match({ user_id: profile.user_id, role_slug: row.role_slug }));
      });
    }
    await Promise.all(Object.values(actors).map(actor => actor.auth.signOut()));
    if (failures.length) throw new AggregateError(failures, 'RLS fixture cleanup failed');
  }
  try {
    for (const account of accounts) {
      actors[account.key] = client();
      const result = ok(await actors[account.key].auth.signInWithPassword({ email: account.email, password: fixturePassword }));
      assert.equal(result.user.id, users[account.key].id, 'Stale fixtures: finish test:env:reset before running tests.');
    }
  } catch (error) { await cleanup(); throw error; }
  return { admin, actors, users, tag, recordIds, snapshot, insert, make, hidden, deniedChange, deniedInsert, roleScope, eventPayload, announcementPayload, contactPayload, cleanup };
}

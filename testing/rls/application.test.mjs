import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationContext, ok, permissionDenied } from './helpers.mjs';

test('application permissions through the real local Supabase API', async t => {
  const c = await applicationContext();
  const { admin, actors: a, users: u, tag, recordIds: ids, make, insert, snapshot, hidden, deniedChange, deniedInsert, roleScope, eventPayload, announcementPayload, contactPayload } = c;
  const active = ['admin', 'president', 'recorder', 'treasurer', 'chair', 'rush', 'member', 'other-member', 'alumni', 'neophyte'];
  const outsiders = ['anonymous', 'pending', 'suspended'];
  async function visible(actor, table, filter) {
    assert.equal(ok(await actor.from(table).select('*').match(filter)).length, 1, `Expected visible ${table} row`);
  }
  async function changed(actor, table, filter, patch) {
    const rows = ok(await actor.from(table).update(patch).match(filter).select('*'));
    assert.equal(rows.length, 1, `Expected permitted ${table} update`);
    for (const [key, value] of Object.entries(patch)) assert.deepEqual(rows[0][key], value);
    return rows[0];
  }
  async function removed(actor, table, filter) {
    assert.equal(ok(await actor.from(table).delete().match(filter).select('*')).length, 1, `Expected permitted ${table} delete`);
    assert.deepEqual(await snapshot(table, filter), []);
  }
  async function restoreInactive(key) {
    ok(await admin.from('profiles').update({ status: u[key].status }).eq('user_id', u[key].id));
    assert.deepEqual(ok(await admin.from('user_roles').select('*').eq('user_id', u[key].id)), []);
  }
  try {
    await t.test('profiles: active members see the active directory but not pending/suspended members', async () => {
      for (const key of ['member', 'alumni', 'neophyte']) {
        const rows = ok(await a[key].from('profiles').select('user_id,status'));
        assert.equal(rows.length, active.length);
        assert.ok(rows.every(row => row.status === 'active'));
      }
      for (const key of ['admin', 'president', 'recorder']) {
        assert.equal(ok(await a[key].from('profiles').select('user_id')).length, 12);
      }
    });
    for (const key of ['member', 'alumni', 'neophyte', 'pending', 'suspended']) {
      await t.test(`profiles: ${key} can edit their own details but cannot escalate or edit a peer`, async () => {
        const filter = { user_id: u[key].id };
        await changed(a[key], 'profiles', filter, { name: `${tag} ${key}`, hometown: 'Fixture Town Two' });
        await deniedChange(a[key], 'profiles', filter, { status: active.includes(key) ? 'suspended' : 'active' });
        await deniedChange(a[key], 'profiles', filter, { email: 'forged@portal.test' });
        await deniedChange(a[key], 'profiles', filter, { user_id: u.admin.id });
        await deniedChange(a[key], 'profiles', { user_id: u['other-member'].id }, { name: 'Unauthorized edit' });
        await deniedChange(a[key], 'profiles', filter);
      });
    }
    for (const key of ['pending', 'suspended']) {
      await t.test(`profiles: ${key} sees exactly their own profile and cannot approve anyone`, async () => {
        assert.deepEqual(ok(await a[key].from('profiles').select('user_id')), [{ user_id: u[key].id }]);
        permissionDenied(await a[key].rpc('approve_member', { target_user_id: u[key].id, chapter_role_slug: 'brother' }));
      });
    }
    await t.test('profiles: an Auth account can bootstrap only its own pending profile', async () => {
      ok(await admin.from('profiles').delete().eq('user_id', u.pending.id));
      await deniedInsert(a.pending, 'profiles', { user_id: u.pending.id, status: 'active', name: tag });
      await deniedInsert(a.suspended, 'profiles', { user_id: u.pending.id, status: 'pending', name: tag });
      const rows = ok(await a.pending.from('profiles').insert({ user_id: u.pending.id, status: 'pending', name: u.pending.name, major: 1, hometown: 'Fixture Town', email: u.pending.email }).select('*'));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, 'pending');
    });
    await t.test('member approval: ordinary users, recorders, and treasurers cannot invoke the privileged RPC', async () => {
      const before = await snapshot('profiles', { user_id: u.pending.id });
      for (const key of ['anonymous', 'member', 'chair', 'recorder', 'treasurer', 'alumni', 'neophyte']) {
        permissionDenied(await a[key].rpc('approve_member', { target_user_id: u.pending.id, chapter_role_slug: 'brother', extra_role_slugs: ['admin'] }));
      }
      assert.deepEqual(await snapshot('profiles', { user_id: u.pending.id }), before);
      assert.deepEqual(await snapshot('user_roles', { user_id: u.pending.id }), []);
    });
    await t.test('member approval: forbidden extra roles and invalid roles leave profile/roles unchanged', async () => {
      for (const extra of [['admin'], ['ea'], ['missing-role']]) {
        const before = await snapshot('profiles', { user_id: u.pending.id });
        const result = await a.president.rpc('approve_member', { target_user_id: u.pending.id, chapter_role_slug: 'brother', extra_role_slugs: extra });
        assert.equal(result.error?.code, extra[0] === 'missing-role' ? '23503' : '42501', result.error?.message);
        assert.deepEqual(await snapshot('profiles', { user_id: u.pending.id }), before);
        assert.deepEqual(await snapshot('user_roles', { user_id: u.pending.id }), []);
      }
      const result = await a.admin.rpc('approve_member', { target_user_id: u.pending.id, chapter_role_slug: 'admin' });
      assert.equal(result.error?.code, '22023');
    });
    for (const [key, target, chapter] of [['admin', 'pending', 'brother'], ['president', 'suspended', 'alumni']]) {
      await t.test(`member approval: ${key} atomically activates ${target} and assigns normalized roles`, async () => {
        try {
          const rows = ok(await a[key].rpc('approve_member', { target_user_id: u[target].id, chapter_role_slug: chapter, extra_role_slugs: [' rush-chair ', 'rush-chair', 'pr'] }));
          assert.equal(rows[0].account_status, 'active');
          assert.deepEqual(rows[0].role_slugs, [chapter === 'alumni' ? 'alum' : chapter, 'pr', 'rush-chair'].sort());
          await visible(a[target], 'profiles', { user_id: u.member.id });
        } finally { await restoreInactive(target); }
      });
    }
    await t.test('member approval: vice president can approve but cannot grant president/admin authority', async () => {
      await roleScope('other-member', ['eda'], async actor => {
        permissionDenied(await actor.rpc('approve_member', { target_user_id: u.pending.id, chapter_role_slug: 'brother', extra_role_slugs: ['ea'] }));
        try {
          const rows = ok(await actor.rpc('approve_member', { target_user_id: u.pending.id, chapter_role_slug: 'neophyte', extra_role_slugs: ['rec'] }));
          assert.deepEqual(rows[0].role_slugs, ['neophyte', 'rec']);
        } finally { await restoreInactive('pending'); }
      });
    });
    await t.test('member status: suspension strips roles and blocks the existing session immediately', async () => {
      const filter = { user_id: u.chair.id };
      const roles = await snapshot('user_roles', filter);
      try {
        await visible(a.chair, 'events', { id: ids.event });
        await changed(a.president, 'profiles', filter, { status: 'suspended' });
        assert.deepEqual(await snapshot('user_roles', filter), []);
        await hidden(a.chair, 'events');
        await hidden(a.chair, 'budget_accounts');
        await hidden(a.chair, 'announcements');
        await visible(a.chair, 'profiles', filter);
        await deniedInsert(a.chair, 'announcements', announcementPayload());
      } finally {
        ok(await admin.from('user_roles').upsert(roles));
        ok(await admin.from('profiles').update({ status: 'active' }).match(filter));
      }
    });
    await t.test('member status: direct activation and removing the last access role are rejected atomically', async () => {
      const result = await a.president.from('profiles').update({ status: 'active' }).eq('user_id', u.pending.id);
      assert.equal(result.error?.code, '23514');
      assert.equal((await snapshot('profiles', { user_id: u.pending.id }))[0].status, 'pending');
      const deletion = await a.admin.from('user_roles').delete().match({ user_id: u.member.id, role_slug: 'brother' });
      assert.equal(deletion.error?.code, '23514');
      assert.equal((await snapshot('user_roles', { user_id: u.member.id, role_slug: 'brother' })).length, 1);
    });
    await t.test('role assignments: active users see active assignments; inactive users see none', async () => {
      for (const key of ['member', 'alumni', 'neophyte']) {
        const rows = ok(await a[key].from('user_roles').select('user_id,role_slug'));
        assert.ok(rows.some(row => row.user_id === u.admin.id && row.role_slug === 'admin'));
        assert.ok(rows.every(row => ![u.pending.id, u.suspended.id].includes(row.user_id)));
      }
      for (const key of outsiders) await hidden(a[key], 'user_roles');
    });
    for (const [key, allowed, forbidden] of [
      ['admin', ['pr', 'rush-chair', 'admin', 'ea', 'eda', 'rec'], []],
      ['president', ['pr', 'rush-chair', 'eda', 'rec'], ['admin', 'ea']],
      ['recorder', ['pr', 'rush-chair', 'treasurer'], ['admin', 'ea', 'eda', 'rec']],
    ]) {
      await t.test(`role hierarchy: ${key} can assign/remove permitted roles and cannot grant protected roles`, async () => {
        for (const role_slug of allowed) {
          const payload = { user_id: u.member.id, role_slug };
          ok(await a[key].from('user_roles').insert(payload));
          assert.equal((await snapshot('user_roles', payload)).length, 1);
          await removed(a[key], 'user_roles', payload);
        }
        for (const role_slug of forbidden) await deniedInsert(a[key], 'user_roles', { user_id: u.member.id, role_slug });
        for (const [target, role_slug] of [['admin', 'admin'], ['president', 'ea']]) {
          if (forbidden.includes(role_slug)) await deniedChange(a[key], 'user_roles', { user_id: u[target].id, role_slug });
        }
      });
    }
    await t.test('role hierarchy: vice president can manage recorder/chair roles but not peers or superiors', async () => {
      await roleScope('other-member', ['eda'], async actor => {
        for (const role_slug of ['rec', 'rush-chair', 'pr']) {
          const payload = { user_id: u.member.id, role_slug };
          ok(await actor.from('user_roles').insert(payload));
          await removed(actor, 'user_roles', payload);
        }
        for (const role_slug of ['admin', 'ea', 'eda']) await deniedInsert(actor, 'user_roles', { user_id: u.member.id, role_slug });
      });
    });
    for (const key of ['member', 'chair', 'treasurer', 'pending', 'suspended']) {
      await t.test(`role escalation: ${key} cannot grant themselves authority or remove another role`, async () => {
        await deniedInsert(a[key], 'user_roles', { user_id: u[key].id, role_slug: 'admin' });
        await deniedChange(a[key], 'user_roles', { user_id: u.admin.id, role_slug: 'admin' });
        await deniedChange(a[key], 'user_roles', { user_id: u.member.id, role_slug: 'brother' }, { role_slug: 'admin' });
      });
    }
    await t.test('role assignments: even admins cannot directly assign roles to inactive users', async () => {
      for (const key of ['pending', 'suspended']) await deniedInsert(a.admin, 'user_roles', { user_id: u[key].id, role_slug: 'brother' });
    });
    await t.test('Auth metadata cannot grant admin or member-approval authority', async () => {
      const original = ok(await a.member.auth.getUser()).user.user_metadata;
      try {
        ok(await a.member.auth.updateUser({ data: { roles: ['admin'], role: 'admin', status: 'active', app_metadata: { roles: ['admin'] } } }));
        ok(await a.member.auth.refreshSession());
        await deniedInsert(a.member, 'user_roles', { user_id: u.member.id, role_slug: 'admin' });
        permissionDenied(await a.member.rpc('approve_member', { target_user_id: u.pending.id, chapter_role_slug: 'brother' }));
        await deniedChange(a.member, 'profiles', { user_id: u.pending.id }, { status: 'active' });
      } finally {
        ok(await admin.auth.admin.updateUserById(u.member.id, { user_metadata: { ...original, roles: null, role: null, status: null, app_metadata: null } }));
        assert.deepEqual(ok(await admin.auth.admin.getUserById(u.member.id)).user.user_metadata, original);
      }
    });

    await t.test('announcements: active users read published posts; inactive and anonymous users cannot', async () => {
      const unpublished = await make('announcements', announcementPayload('chair', { visibility: 'pending' }));
      for (const key of active) {
        await visible(a[key], 'announcements', { id: ids.announcement });
        await hidden(a[key], 'announcements', { id: unpublished.id });
      }
      for (const key of outsiders) await hidden(a[key], 'announcements');
    });
    for (const key of ['admin', 'president', 'recorder', 'treasurer', 'chair', 'rush']) {
      await t.test(`announcements: ${key} publishes as themselves and edits their own post`, async () => {
        const row = await make('announcements', announcementPayload(key), a[key]);
        await changed(a[key], 'announcements', { id: row.id }, { title: `${tag} edited` });
        await deniedInsert(a[key], 'announcements', announcementPayload(key, { author_id: u.member.id }));
        await deniedChange(a[key], 'announcements', { id: row.id }, { author_id: u.member.id });
        await deniedChange(a[key], 'announcements', { id: row.id }, { likes: 1000 });
        await deniedChange(a[key], 'announcements', { id: row.id }, { reply_count: 1000 });
        await removed(a[key], 'announcements', { id: row.id });
      });
    }
    await t.test('announcements: members/alumni/neophytes and inactive users cannot publish', async () => {
      for (const key of ['member', 'alumni', 'neophyte', ...outsiders]) {
        await deniedInsert(a[key], 'announcements', announcementPayload(key === 'anonymous' ? 'member' : key));
      }
      await roleScope('other-member', ['pr'], async actor => {
        // PR remains a valid assignment; it does not currently confer publishing.
        await deniedInsert(actor, 'announcements', announcementPayload('other-member'));
      });
    });
    await t.test('announcements: only author/admin can edit; president can moderate by deletion', async () => {
      const row = await make('announcements', announcementPayload());
      for (const key of ['member', 'recorder', 'rush', 'president', 'pending', 'suspended']) await deniedChange(a[key], 'announcements', { id: row.id }, { body: 'Unauthorized rewrite' });
      await changed(a.admin, 'announcements', { id: row.id }, { body: 'Admin moderation' });
      await deniedChange(a.recorder, 'announcements', { id: row.id });
      await removed(a.president, 'announcements', { id: row.id });
    });
    await t.test('replies: members can reply/edit/delete their own reply without impersonation or moving it', async () => {
      const post = await make('announcements', announcementPayload());
      const other = await make('announcements', announcementPayload());
      const reply = await make('announcement_replies', { announcement_id: post.id, author_id: u.member.id, body: tag }, a.member);
      assert.equal((await snapshot('announcements', { id: post.id }))[0].reply_count, 1);
      await changed(a.member, 'announcement_replies', { id: reply.id }, { body: 'Corrected reply' });
      await deniedChange(a.member, 'announcement_replies', { id: reply.id }, { author_id: u.admin.id });
      await deniedChange(a.member, 'announcement_replies', { id: reply.id }, { announcement_id: other.id });
      await deniedInsert(a.member, 'announcement_replies', { announcement_id: post.id, author_id: u.admin.id, body: tag });
      for (const key of ['other-member', 'admin', 'president']) await deniedChange(a[key], 'announcement_replies', { id: reply.id }, { body: 'Rewrite another author' });
      await deniedChange(a['other-member'], 'announcement_replies', { id: reply.id });
      await removed(a.member, 'announcement_replies', { id: reply.id });
      assert.equal((await snapshot('announcements', { id: post.id }))[0].reply_count, 0);
    });
    await t.test('replies: managers may delete but inactive users and hidden-parent requests are denied', async () => {
      const post = await make('announcements', announcementPayload());
      const unpublished = await make('announcements', announcementPayload('chair', { visibility: 'pending' }));
      const invisible = await make('announcement_replies', { announcement_id: unpublished.id, author_id: u.member.id, body: tag });
      for (const key of ['admin', 'president']) {
        const reply = await make('announcement_replies', { announcement_id: post.id, author_id: u.member.id, body: tag }, a.member);
        await removed(a[key], 'announcement_replies', { id: reply.id });
      }
      for (const key of ['member', 'admin', ...outsiders]) {
        await hidden(a[key], 'announcement_replies', { id: invisible.id });
        await deniedInsert(a[key], 'announcement_replies', { announcement_id: unpublished.id, author_id: u[key === 'anonymous' ? 'member' : key].id, body: tag });
      }
      for (const key of outsiders) {
        await hidden(a[key], 'announcement_replies');
        await deniedInsert(a[key], 'announcement_replies', { announcement_id: post.id, author_id: u[key === 'anonymous' ? 'member' : key].id, body: tag });
      }
    });
    await t.test('likes: ownership is enforced and the server maintains counters', async () => {
      const post = await make('announcements', announcementPayload());
      const payload = { announcement_id: post.id, user_id: u.member.id };
      ok(await a.member.from('announcement_likes').insert(payload));
      assert.equal((await snapshot('announcements', { id: post.id }))[0].likes, 1);
      await hidden(a['other-member'], 'announcement_likes', payload);
      await hidden(a.admin, 'announcement_likes', payload);
      await deniedInsert(a['other-member'], 'announcement_likes', { announcement_id: post.id, user_id: u.admin.id });
      await deniedChange(a['other-member'], 'announcement_likes', payload);
      await deniedChange(a.member, 'announcement_likes', payload, { user_id: u.admin.id });
      for (const key of outsiders) await deniedInsert(a[key], 'announcement_likes', { announcement_id: post.id, user_id: u[key === 'anonymous' ? 'member' : key].id });
      await removed(a.member, 'announcement_likes', payload);
      assert.equal((await snapshot('announcements', { id: post.id }))[0].likes, 0);
      const unpublished = await make('announcements', announcementPayload('chair', { visibility: 'pending' }));
      await deniedInsert(a.member, 'announcement_likes', { announcement_id: unpublished.id, user_id: u.member.id });
    });

    await t.test('events: brother visibility and alumni/neophyte flags are independent', async () => {
      const rows = [];
      for (const extra of [{}, { visible_to_alum: true }, { visible_to_neophyte: true }, { visible_to_alum: true, visible_to_neophyte: true }]) rows.push(await make('events', eventPayload('admin', 'party', extra)));
      for (const [index, row] of rows.entries()) {
        await visible(a.member, 'events', { id: row.id });
        if ([1, 3].includes(index)) await visible(a.alumni, 'events', { id: row.id });
        else await hidden(a.alumni, 'events', { id: row.id });
        if ([2, 3].includes(index)) await visible(a.neophyte, 'events', { id: row.id });
        else await hidden(a.neophyte, 'events', { id: row.id });
        for (const key of outsiders) await hidden(a[key], 'events', { id: row.id });
      }
    });
    for (const [role, types] of [
      ['social-chair', ['party', 'formal']], ['rush-chair', ['rush']], ['social-events', ['sorority_fraternity']],
      ['dei-chair', ['dei']], ['alumni-chair', ['alumni_event']], ['chapter-dev', ['brotherhood_event']],
      ['cs-chair', ['community_service']], ['philo-chair', ['philanthropy']], ['prof-dev', ['professional_development']],
      ['scholarship', ['scholarship']], ['hm', ['house_meeting', 'work_party']],
      ['membered', ['new_member_meeting', 'new_member_event']], ['hsm', ['party', 'formal', 'brotherhood_event', 'hsm_event']],
    ]) {
      await t.test(`events: ${role} manages only its permitted event categories`, async () => {
        await roleScope('other-member', [role], async actor => {
          for (const type of types) {
            const row = await make('events', eventPayload('other-member', type), actor);
            await changed(actor, 'events', { id: row.id }, { title: `${tag} edited` });
            const forbidden = type === 'rush' ? 'party' : 'rush';
            await deniedChange(actor, 'events', { id: row.id }, { event_type: forbidden, event_tags: [forbidden] });
            await removed(actor, 'events', { id: row.id });
          }
          const forbidden = types.includes('rush') ? 'party' : 'rush';
          await deniedInsert(actor, 'events', eventPayload('other-member', forbidden));
          const others = await make('events', eventPayload('admin', forbidden));
          await deniedChange(actor, 'events', { id: others.id }, { title: 'Unauthorized edit' });
          await deniedChange(actor, 'events', { id: others.id });
        });
      });
    }
    for (const key of ['admin', 'president', 'recorder']) {
      await t.test(`events: ${key} manages events across categories without forging creators`, async () => {
        for (const type of ['rush', 'party', 'house_meeting', 'other']) {
          const row = await make('events', eventPayload(key, type), a[key]);
          await changed(a[key], 'events', { id: row.id }, { title: `${tag} edited` });
          await deniedChange(a[key], 'events', { id: row.id }, { created_by: u.member.id });
          await removed(a[key], 'events', { id: row.id });
        }
        await deniedInsert(a[key], 'events', eventPayload(key, 'party', { created_by: u.member.id }));
      });
    }
    await t.test('events: ordinary members and inactive accounts cannot create, edit, or delete', async () => {
      const row = await make('events', eventPayload());
      for (const key of ['member', 'alumni', 'neophyte', 'treasurer', ...outsiders]) {
        await deniedInsert(a[key], 'events', eventPayload(key === 'anonymous' ? 'member' : key));
        await deniedChange(a[key], 'events', { id: row.id }, { title: 'Unauthorized event edit' });
        await deniedChange(a[key], 'events', { id: row.id });
      }
    });
    await t.test('calendars: active users read; only calendar managers create, edit, and delete', async () => {
      for (const key of active) await visible(a[key], 'calendars', { id: 1 });
      for (const key of ['admin', 'president', 'recorder']) {
        const row = await make('calendars', { name: tag, start: '2027-01-01', end: '2027-12-31' }, a[key]);
        await changed(a[key], 'calendars', { id: row.id }, { name: `${tag} edited` });
        await removed(a[key], 'calendars', { id: row.id });
      }
      for (const key of ['member', 'chair', 'treasurer', ...outsiders]) {
        if (outsiders.includes(key)) await hidden(a[key], 'calendars');
        await deniedInsert(a[key], 'calendars', { name: tag, start: '2027-01-01', end: '2027-12-31' });
        await deniedChange(a[key], 'calendars', { id: 1 }, { name: 'Unauthorized calendar' });
        await deniedChange(a[key], 'calendars', { id: 1 });
      }
    });

    await t.test('attendance: recorder records, reads, and corrects eligible house-meeting attendance', async () => {
      const event = await make('events', eventPayload());
      for (const key of ['member', 'neophyte']) {
        const row = await make('event_attendance', { event_id: event.id, member_id: u[key].id, status: 'present' }, a.recorder);
        assert.equal(row.recorded_by, u.recorder.id);
        await visible(a.recorder, 'event_attendance', { id: row.id });
        await changed(a.recorder, 'event_attendance', { id: row.id }, { status: 'excused', notes: 'Class conflict', recorded_by: u.recorder.id });
        await deniedChange(a.recorder, 'event_attendance', { id: row.id }, { member_id: u.admin.id });
        await deniedChange(a.recorder, 'event_attendance', { id: row.id }, { recorded_by: u.admin.id });
        await deniedChange(a.recorder, 'event_attendance', { id: row.id });
      }
    });
    await t.test('attendance: admin/president/member status alone does not confer recorder access', async () => {
      const event = await make('events', eventPayload());
      const row = await make('event_attendance', { event_id: event.id, member_id: u.member.id, status: 'present', recorded_by: u.recorder.id });
      for (const key of ['admin', 'president', 'treasurer', 'member', 'chair', 'alumni', 'neophyte', ...outsiders]) {
        await hidden(a[key], 'event_attendance', { id: row.id });
        await deniedInsert(a[key], 'event_attendance', { event_id: event.id, member_id: u['other-member'].id, status: 'present', recorded_by: u[key === 'anonymous' ? 'member' : key].id });
        await deniedChange(a[key], 'event_attendance', { id: row.id }, { status: 'absent' });
        await deniedChange(a[key], 'event_attendance', { id: row.id });
      }
    });
    await t.test('attendance: ineligible members, forged recorders, and non-meeting events are rejected', async () => {
      const event = await make('events', eventPayload());
      for (const key of ['alumni', 'pending', 'suspended']) await deniedInsert(a.recorder, 'event_attendance', { event_id: event.id, member_id: u[key].id, status: 'present', recorded_by: u.recorder.id });
      await deniedInsert(a.recorder, 'event_attendance', { event_id: event.id, member_id: u.member.id, status: 'present', recorded_by: u.admin.id });
      const party = await make('events', eventPayload('admin', 'party'));
      const result = await insert(a.recorder, 'event_attendance', { event_id: party.id, member_id: u.member.id, status: 'present', recorded_by: u.recorder.id });
      assert.equal(result.error?.code, 'P0001');
      assert.match(result.error.message, /only.*house meeting/);
    });

    for (const key of ['member', 'alumni', 'neophyte', 'pending', 'suspended']) {
      await t.test(`emergency contacts: ${key} retains own CRUD but cannot access or transfer another contact`, async () => {
        const row = await make('emergency_contacts', contactPayload(key), a[key]);
        await visible(a[key], 'emergency_contacts', { id: row.id });
        await changed(a[key], 'emergency_contacts', { id: row.id }, { phone: '202-555-0198' });
        await deniedChange(a[key], 'emergency_contacts', { id: row.id }, { user_id: u.admin.id });
        const foreign = await make('emergency_contacts', contactPayload('other-member'));
        await hidden(a[key], 'emergency_contacts', { id: foreign.id });
        await deniedInsert(a[key], 'emergency_contacts', contactPayload('other-member'));
        await deniedChange(a[key], 'emergency_contacts', { id: foreign.id }, { phone: '202-555-0101' });
        await deniedChange(a[key], 'emergency_contacts', { id: foreign.id });
        await removed(a[key], 'emergency_contacts', { id: row.id });
      });
    }
    await t.test('emergency contacts: admins manage others; president and HSM read only', async () => {
      const row = await make('emergency_contacts', contactPayload('other-member'), a.admin);
      await changed(a.admin, 'emergency_contacts', { id: row.id }, { name: 'Corrected Guardian' });
      await visible(a.president, 'emergency_contacts', { id: row.id });
      await deniedChange(a.president, 'emergency_contacts', { id: row.id }, { phone: '202-555-0101' });
      await deniedChange(a.president, 'emergency_contacts', { id: row.id });
      await deniedInsert(a.president, 'emergency_contacts', contactPayload('other-member'));
      await roleScope('other-member', ['hsm'], async actor => {
        await visible(actor, 'emergency_contacts', { id: ids.contact });
        await deniedChange(actor, 'emergency_contacts', { id: ids.contact }, { phone: '202-555-0101' });
        await deniedChange(actor, 'emergency_contacts', { id: ids.contact });
      });
      for (const key of ['recorder', 'treasurer', 'chair', 'rush', 'member', ...outsiders]) {
        await hidden(a[key], 'emergency_contacts', { id: row.id });
        await deniedChange(a[key], 'emergency_contacts', { id: row.id }, { name: 'Unauthorized contact edit' });
        await deniedChange(a[key], 'emergency_contacts', { id: row.id });
      }
      await removed(a.admin, 'emergency_contacts', { id: row.id });
    });

    await t.test('wait-ons: only published schedules and assignments are visible to active users', async () => {
      const published = await make('wait_on_schedules', { week_start: '2027-03-01', published: true, created_by: u.admin.id });
      const draft = await make('wait_on_schedules', { week_start: '2027-03-08', published: false, created_by: u.admin.id });
      const publicAssignment = await make('wait_on_assignments', { schedule_id: published.id, slot_key: 'monday_dinner', brother_id: u.member.id });
      const hiddenAssignment = await make('wait_on_assignments', { schedule_id: draft.id, slot_key: 'monday_dinner', brother_id: u.member.id });
      for (const key of ['member', 'chair', 'recorder', 'alumni', 'neophyte']) {
        await visible(a[key], 'wait_on_schedules', { id: published.id });
        await visible(a[key], 'wait_on_assignments', { id: publicAssignment.id });
        await hidden(a[key], 'wait_on_schedules', { id: draft.id });
        await hidden(a[key], 'wait_on_assignments', { id: hiddenAssignment.id });
        await deniedChange(a[key], 'wait_on_schedules', { id: published.id }, { published: false });
        await deniedChange(a[key], 'wait_on_schedules', { id: published.id });
        await deniedChange(a[key], 'wait_on_assignments', { id: publicAssignment.id }, { brother_id: u.admin.id });
        await deniedChange(a[key], 'wait_on_assignments', { id: publicAssignment.id });
        await deniedInsert(a[key], 'wait_on_schedules', { week_start: '2027-03-15', created_by: u[key].id });
        await deniedInsert(a[key], 'wait_on_assignments', { schedule_id: published.id, slot_key: 'tuesday_dinner', brother_id: u[key].id });
      }
      for (const key of outsiders) {
        await hidden(a[key], 'wait_on_schedules');
        await hidden(a[key], 'wait_on_assignments');
        await deniedInsert(a[key], 'wait_on_schedules', { week_start: '2027-03-15', created_by: u[key === 'anonymous' ? 'member' : key].id });
        await deniedInsert(a[key], 'wait_on_assignments', { schedule_id: published.id, slot_key: 'tuesday_dinner', brother_id: u.member.id });
      }
    });
    for (const key of ['admin', 'president']) {
      await t.test(`wait-ons: ${key} manages draft schedules, assignments, and publication`, async () => {
        const schedule = await make('wait_on_schedules', { week_start: key === 'admin' ? '2027-04-05' : '2027-04-12', created_by: u[key].id }, a[key]);
        const assignment = await make('wait_on_assignments', { schedule_id: schedule.id, slot_key: 'monday_dinner', brother_id: u.member.id }, a[key]);
        await visible(a[key], 'wait_on_schedules', { id: schedule.id });
        await visible(a[key], 'wait_on_assignments', { id: assignment.id });
        await changed(a[key], 'wait_on_assignments', { id: assignment.id }, { brother_id: u['other-member'].id });
        await changed(a[key], 'wait_on_schedules', { id: schedule.id }, { published: true });
        await visible(a.member, 'wait_on_assignments', { id: assignment.id });
        await deniedInsert(a[key], 'wait_on_schedules', { week_start: '2027-04-12', created_by: u.member.id });
        await removed(a[key], 'wait_on_assignments', { id: assignment.id });
        await removed(a[key], 'wait_on_schedules', { id: schedule.id });
      });
    }
    await t.test('wait-ons: steward and vice president can manage drafts without broader admin roles', async () => {
      for (const role of ['stew', 'eda']) await roleScope('other-member', [role], async actor => {
        const schedule = await make('wait_on_schedules', { week_start: '2027-05-03', created_by: u['other-member'].id }, actor);
        await changed(actor, 'wait_on_schedules', { id: schedule.id }, { published: true });
        await removed(actor, 'wait_on_schedules', { id: schedule.id });
      });
    });

    await t.test('budgets: chairs see their account only; managers see both; inactive requests see none', async () => {
      for (const [key, own, other] of [['chair', ids.socialBudget, ids.rushBudget], ['rush', ids.rushBudget, ids.socialBudget]]) {
        await visible(a[key], 'budget_accounts', { id: own });
        await hidden(a[key], 'budget_accounts', { id: other });
        await deniedChange(a[key], 'budget_accounts', { id: own }, { allocated_amount: 9999 });
        await deniedChange(a[key], 'budget_accounts', { id: own });
      }
      for (const key of ['admin', 'president', 'treasurer']) {
        await visible(a[key], 'budget_accounts', { id: ids.socialBudget });
        await visible(a[key], 'budget_accounts', { id: ids.rushBudget });
      }
      for (const key of ['member', 'alumni', 'neophyte', 'recorder', ...outsiders]) await hidden(a[key], 'budget_accounts');
      for (const key of active) await visible(a[key], 'budget_cycles', { id: ids.budgetCycle });
      for (const key of outsiders) await hidden(a[key], 'budget_cycles');
    });
    for (const key of ['admin', 'president', 'treasurer']) {
      await t.test(`budgets: ${key} manages empty cycles and accounts`, async () => {
        const cycle = await make('budget_cycles', { name: tag, start_date: '2027-01-01', end_date: '2027-12-31', created_by: u[key].id }, a[key]);
        const account = await make('budget_accounts', { cycle_id: cycle.id, role_slug: 'pr', allocated_amount: 500, created_by: u[key].id }, a[key]);
        await changed(a[key], 'budget_accounts', { id: account.id }, { allocated_amount: 600 });
        await changed(a[key], 'budget_cycles', { id: cycle.id }, { name: `${tag} revised` });
        await removed(a[key], 'budget_accounts', { id: account.id });
        await removed(a[key], 'budget_cycles', { id: cycle.id });
      });
    }
    await t.test('budgets: non-managers cannot create accounts/cycles or change cycle allocation settings', async () => {
      const cycle = await make('budget_cycles', { name: tag, start_date: '2027-01-01', end_date: '2027-12-31' });
      for (const key of ['member', 'chair', 'rush', 'recorder', 'alumni', 'neophyte', ...outsiders]) {
        await deniedInsert(a[key], 'budget_cycles', { name: tag, start_date: '2027-01-01', end_date: '2027-12-31' });
        await deniedInsert(a[key], 'budget_accounts', { cycle_id: cycle.id, role_slug: 'pr', allocated_amount: 500 });
        await deniedChange(a[key], 'budget_cycles', { id: cycle.id }, { name: 'Unauthorized cycle' });
        await deniedChange(a[key], 'budget_cycles', { id: cycle.id });
      }
    });
    await t.test('reference data: all signed-in statuses retain read-only roles/majors access', async () => {
      for (const key of [...active, 'pending', 'suspended']) {
        await visible(a[key], 'roles', { slug: 'pr' });
        await visible(a[key], 'roles', { slug: 'rush-chair' });
        await visible(a[key], 'majors', { id: 1 });
        await deniedInsert(a[key], 'roles', { slug: tag, name: tag });
        await deniedInsert(a[key], 'majors', { major: tag, slug: tag });
        await deniedChange(a[key], 'roles', { slug: 'admin' }, { name: 'Forged role' });
        await deniedChange(a[key], 'roles', { slug: 'pr' });
        await deniedChange(a[key], 'majors', { id: 1 }, { major: 'Forged major' });
        await deniedChange(a[key], 'majors', { id: 1 });
      }
      await hidden(a.anonymous, 'roles');
      await hidden(a.anonymous, 'majors');
    });
    for (const key of ['pending', 'suspended']) {
      await t.test(`inactive defense: ${key} stays blocked even with stale elevated role records`, async () => {
        const event = await make('events', eventPayload());
        const attendance = await make('event_attendance', { event_id: event.id, member_id: u.member.id, status: 'present', recorded_by: u.recorder.id });
        const schedule = await make('wait_on_schedules', { week_start: key === 'pending' ? '2027-06-07' : '2027-06-14', published: true, created_by: u.admin.id });
        const assignment = await make('wait_on_assignments', { schedule_id: schedule.id, slot_key: 'monday_dinner', brother_id: u.member.id });
        await roleScope(key, ['admin', 'ea', 'rec', 'hsm', 'stew', 'social-chair'], async actor => {
          for (const table of ['announcements', 'announcement_replies', 'events', 'event_attendance', 'calendars', 'budget_cycles', 'budget_accounts', 'budget_transactions', 'wait_on_schedules', 'wait_on_assignments', 'user_roles']) await hidden(actor, table);
          await hidden(actor, 'profiles', { user_id: u.member.id });
          await hidden(actor, 'emergency_contacts', { id: ids.contact });
          await deniedChange(actor, 'emergency_contacts', { id: ids.contact }, { phone: '202-555-0101' });
          await deniedChange(actor, 'events', { id: event.id }, { title: 'Inactive manager edit' });
          await deniedChange(actor, 'event_attendance', { id: attendance.id }, { status: 'absent', recorded_by: u[key].id });
          await deniedChange(actor, 'wait_on_schedules', { id: schedule.id }, { published: false });
          await deniedChange(actor, 'wait_on_assignments', { id: assignment.id }, { brother_id: u[key].id });
          await deniedChange(actor, 'budget_accounts', { id: ids.socialBudget }, { allocated_amount: 9999 });
          await deniedInsert(actor, 'announcements', announcementPayload(key));
          await deniedInsert(actor, 'events', eventPayload(key));
          await deniedInsert(actor, 'user_roles', { user_id: u.member.id, role_slug: 'pr' });
          permissionDenied(await actor.rpc('approve_member', { target_user_id: u.pending.id, chapter_role_slug: 'brother' }));
        });
      });
    }
    await t.test('role revocation takes effect for an already signed-in session', async () => {
      await roleScope('other-member', ['rush-chair'], async actor => {
        const row = await make('events', eventPayload('other-member', 'rush'), actor);
        await removed(actor, 'events', { id: row.id });
      });
      await deniedInsert(a['other-member'], 'events', eventPayload('other-member', 'rush'));
    });
    await t.test('public legacy helper RPCs remain inaccessible to ordinary API roles', async () => {
      for (const key of ['anonymous', 'member', 'admin', 'pending', 'suspended']) {
        for (const name of ['is_active', 'is_admin', 'can_manage_members']) permissionDenied(await a[key].rpc(name, { check_user_id: u.admin.id }));
        permissionDenied(await a[key].rpc('is_budget_manager'));
      }
    });
    await t.test('internal tables: ordinary API sessions including app admins cannot read or mutate audit/legacy finance data', async () => {
      const log = await make('audit_log', { actor_id: u.admin.id, action: tag, target_user_id: u.member.id });
      const transaction = await make('transactions', { budget_id: ids.socialBudget, amount: 10, vendor: tag, created_by: u.member.id });
      for (const key of ['admin', 'president', 'treasurer', 'member', ...outsiders]) {
        await hidden(a[key], 'audit_log');
        await hidden(a[key], 'transactions');
        await deniedInsert(a[key], 'audit_log', { actor_id: u[key === 'anonymous' ? 'member' : key].id, action: tag });
        await deniedInsert(a[key], 'transactions', { budget_id: ids.socialBudget, amount: 10, vendor: tag, created_by: u.member.id });
        await deniedChange(a[key], 'audit_log', { id: log.id }, { action: 'Rewrite audit' });
        await deniedChange(a[key], 'audit_log', { id: log.id });
        await deniedChange(a[key], 'transactions', { id: transaction.id }, { amount: 9999 });
        await deniedChange(a[key], 'transactions', { id: transaction.id });
      }
    });
    await t.test('anonymous requests cannot read the member directory or mutate profiles', async () => {
      await hidden(a.anonymous, 'profiles');
      await deniedChange(a.anonymous, 'profiles', { user_id: u.member.id }, { name: 'Anonymous edit' });
      await deniedInsert(a.anonymous, 'profiles', { user_id: u.pending.id, status: 'pending', name: tag });
    });
  } finally { await c.cleanup(); }
});

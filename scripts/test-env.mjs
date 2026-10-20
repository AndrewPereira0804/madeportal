import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { accounts, fixturePassword, recordIds } from '../testing/fixtures.mjs';
import { seedFixtures } from '../testing/seed-fixtures.mjs';
import { ensureLoopback } from '../testing/docker-loopback.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.join(root, '.test-env');
const project = 'portal-tests';
const container = `supabase_db_${project}`;
const network = 'portal-tests-loopback';
const apiUrl = 'http://127.0.0.1:55431';
const cli = path.join(root, 'node_modules/supabase/dist/supabase.js');
const action = process.argv[2];
const allowed = ['start', 'reset', 'stop', 'status', 'verify', 'app'];
if (!allowed.includes(action) || process.argv.length !== 3) {
  throw new Error(`Usage: node scripts/test-env.mjs ${allowed.join('|')}. Extra flags/URLs are forbidden.`);
}

function dockerPath() {
  const candidates = process.platform === 'win32' ? [
    path.join(process.env.LOCALAPPDATA || '', 'Programs/DockerDesktop/resources/bin/docker.exe'),
    'C:/Program Files/Docker/Docker/resources/bin/docker.exe',
  ] : [];
  return candidates.find(candidate => existsSync(candidate)) || 'docker';
}
const docker = dockerPath();
const childEnv = { ...process.env, PATH: `${path.dirname(docker)}${path.delimiter}${process.env.PATH || ''}` };
// Always use the installed CLI version; an ambient binary override could bypass our local-only arguments.
delete childEnv.SUPABASE_CLI_BINARY_OVERRIDE;

function run(binary, args, { input, live = false, env = childEnv, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: root, env, windowsHide: true, stdio: live ? 'inherit' : ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout?.on('data', data => { stdout += data; });
    child.stderr?.on('data', data => {
      stderr += data;
      // Progress only: do not echo status JSON or the locally generated API keys.
      for (const line of String(data).split('\n')) {
        if (/^(Applying migration|Seeding data|Starting database|Waiting for health)/.test(line)) console.log(line.trim());
      }
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code && !allowFailure) reject(new Error(`${path.basename(binary)} ${args[0]} failed (${code}):\n${stderr || stdout}`));
      else resolve({ stdout, stderr, code });
    });
    if (!live) child.stdin.end(input);
  });
}
const supabase = args => run(process.execPath, [cli, ...args, '--workdir', workspace]);

async function checkDocker() {
  const hostOverride = process.env.DOCKER_HOST;
  if (hostOverride && !/^(unix:|npipe:)/.test(hostOverride)) throw new Error('Tests require a local Docker engine.');
  const { stdout } = await run(docker, ['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}']);
  if (!/^(unix:|npipe:)/.test(JSON.parse(stdout))) throw new Error('Refusing a remote Docker context.');
  await run(docker, ['info', '--format', '{{.ServerVersion}}']);
}

async function prepare() {
  const config = await readFile(path.join(root, 'testing/supabase.toml'), 'utf8');
  if (!/^project_id = "portal-tests"$/m.test(config)) throw new Error('Unexpected test project ID.');
  const dir = path.join(workspace, 'supabase');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'config.toml'), config);
  const target = path.resolve(dir, 'migrations');
  if (target !== path.join(root, '.test-env', 'supabase', 'migrations')) throw new Error('Unsafe generated migration path.');
  // Only this generated copy is replaced. The repository history and Docker volumes are untouched.
  await rm(target, { recursive: true, force: true });
  await mkdir(target);
  const exclusions = JSON.parse(await readFile(path.join(root, 'testing/replay-exclusions.json'), 'utf8'));
  const files = (await readdir(path.join(root, 'supabase/migrations'))).filter(name => name.endsWith('.sql')).sort();
  for (const name of Object.keys(exclusions)) if (!files.includes(name)) throw new Error(`Stale replay exclusion: ${name}`);
  for (const name of files) {
    if (!(name in exclusions)) await copyFile(path.join(root, 'supabase/migrations', name), path.join(target, name));
  }
  await copyFile(path.join(root, 'supabase/seed.sql'), path.join(dir, 'seed.sql'));
  const linkedRef = path.join(dir, '.temp/project-ref');
  if (existsSync(linkedRef)) throw new Error('Test workspace must never be linked to a hosted project.');
}

async function ensureNetwork() {
  let result = await run(docker, ['network', 'inspect', network], { allowFailure: true });
  if (result.code) {
    await run(docker, ['network', 'create', '--label', 'com.portal.purpose=tests', '-o', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', network]);
    result = await run(docker, ['network', 'inspect', network]);
  }
  const config = JSON.parse(result.stdout)[0];
  if (config.Options?.['com.docker.network.bridge.host_binding_ipv4'] !== '127.0.0.1') throw new Error('Test network must bind published ports to loopback.');
}

async function assertTestContainer() {
  const { stdout } = await run(docker, ['inspect', container, '--format', '{{json .Config.Labels}}']);
  if (JSON.parse(stdout)['com.supabase.cli.project'] !== project) throw new Error('Unexpected Docker container identity.');
}

async function sql(query) {
  await assertTestContainer();
  const result = await run(docker, ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: query });
  return result.stdout.trim();
}

async function clients() {
  await assertTestContainer();
  const { stdout } = await supabase(['status', '-o', 'json']);
  const status = JSON.parse(stdout);
  const actualUrl = status.API_URL ?? status.api?.url;
  if (actualUrl !== apiUrl) throw new Error(`Refusing unexpected Supabase URL: ${actualUrl}`);
  const key = status.SERVICE_ROLE_KEY ?? status.auth?.service_role_key;
  const anon = status.ANON_KEY ?? status.auth?.anon_key;
  if (!key || !anon) throw new Error('CLI status did not supply the local API keys.');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return { admin: createClient(apiUrl, key, options), publicKey: anon, client: () => createClient(apiUrl, anon, options) };
}

async function seed() {
  const { admin } = await clients();
  const fixtureUsers = await seedFixtures(admin);
  await writeFile(path.join(workspace, 'fixtures.json'), JSON.stringify({ apiUrl, users: fixtureUsers, recordIds }, null, 2) + '\n');
  console.log(`Seeded ${fixtureUsers.length} fictional email/password accounts and sample records.`);
}

function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalized(value[key])]));
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n') : value;
}
export function catalogDigest(row) {
  row = structuredClone(row);
  if (row.kind === 'function' && row.definition.acl) row.definition.acl = row.definition.acl.slice(1, -1).split(',').sort().join(',');
  return createHash('sha256').update(JSON.stringify(normalized(row))).digest('hex');
}

async function verify() {
  const exclusions = JSON.parse(await readFile(path.join(root, 'testing/replay-exclusions.json'), 'utf8'));
  const expectedVersions = (await readdir(path.join(root, 'supabase/migrations')))
    .filter(name => name.endsWith('.sql') && !(name in exclusions)).map(name => name.slice(0, 14)).sort();
  const appliedVersions = JSON.parse(await sql("SELECT coalesce(jsonb_agg(version ORDER BY version), '[]'::jsonb) FROM supabase_migrations.schema_migrations;"));
  if (JSON.stringify(expectedVersions) !== JSON.stringify(appliedVersions)) throw new Error('Local migration history is stale. Run npm run test:env:reset.');
  const query = (await readFile(path.join(root, 'testing/catalog.sql'), 'utf8')).trim().replace(/;$/, '');
  const rows = JSON.parse(await sql(`SELECT jsonb_agg(c ORDER BY kind, name) FROM (${query}) c;`));
  const baseline = JSON.parse(await readFile(path.join(root, 'testing/schema-baseline.json'), 'utf8'));
  const grouped = {};
  for (const row of rows) {
    if (['extension', 'default_acl', 'schema_acl'].includes(row.kind)) continue;
    (grouped[row.kind] ??= []).push(`${row.name}:${catalogDigest(row)}`);
  }
  const objects = Object.fromEntries(Object.entries(grouped).map(([kind, entries]) => [kind, {
    count: entries.length,
    sha256: createHash('sha256').update(entries.sort().join('\n')).digest('hex'),
  }]));
  const differences = [...new Set([...Object.keys(objects), ...Object.keys(baseline.objects)])].filter(key => JSON.stringify(objects[key]) !== JSON.stringify(baseline.objects[key]));
  if (differences.length) throw new Error(`Schema/grant differences from the reviewed application baseline:\n${differences.join('\n')}`);
  const { admin, client } = await clients();
  const expectedCounts = { profiles: accounts.length, roles: 24, majors: 5, announcements: 1, announcement_replies: 1, events: 2, budget_cycles: 1, budget_accounts: 2, budget_transactions: 1, emergency_contacts: 1 };
  for (const [table, expected] of Object.entries(expectedCounts)) {
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
    if (error || count !== expected) throw new Error(`Unexpected fixture count for ${table}; reset the test environment.`);
  }
  const { data: announcement, error: countError } = await admin.from('announcements').select('reply_count').eq('id', recordIds.announcement).single();
  if (countError || announcement.reply_count !== 1) throw new Error('Fixture reply counter is inconsistent.');
  for (const account of accounts) {
    const userClient = client();
    const { data: login, error } = await userClient.auth.signInWithPassword({ email: account.email, password: fixturePassword });
    if (error) throw new Error(`Login failed for ${account.email}: ${error.message}`);
    const { data: profile, error: profileError } = await userClient.from('profiles').select('status').eq('user_id', login.user.id).single();
    if (profileError || profile.status !== account.status) throw new Error(`Unexpected profile for ${account.email}`);
    const { data: roles, error: roleError } = await userClient.from('user_roles').select('role_slug').eq('user_id', login.user.id);
    if (roleError || JSON.stringify(roles.map(row => row.role_slug).sort()) !== JSON.stringify([...account.roles].sort())) throw new Error(`Unexpected roles for ${account.email}`);
    await userClient.auth.signOut();
  }
  console.log(`Verified ${expectedVersions.length} migrations, reviewed application schema/grants (${rows.filter(row => row.kind === 'policy').length} policies), fixture records, and all ${accounts.length} account logins/statuses/roles.`);
}

try {
  await checkDocker();
  if (['start', 'reset'].includes(action)) {
    await prepare();
    await ensureNetwork();
  } else {
    const config = await readFile(path.join(workspace, 'supabase/config.toml'), 'utf8');
    if (!/^project_id = "portal-tests"$/m.test(config)) throw new Error('Unexpected test project ID.');
  }
  if (action === 'start') {
    console.log('Starting isolated portal-tests stack (first start may download Docker images)...');
    await supabase(['start', '--network-id', network]);
    await ensureLoopback(run, docker, workspace);
    await seed();
    await verify();
  } else if (action === 'reset') {
    await assertTestContainer();
    console.log('Rebuilding only portal-tests from migrations...');
    await supabase(['db', 'reset', '--local', '--yes', '--network-id', network]);
    await ensureLoopback(run, docker, workspace);
    await seed();
    await verify();
  } else if (action === 'stop') {
    await assertTestContainer();
    await supabase(['stop', '--project-id', project]);
    console.log('Stopped portal-tests; its volumes are retained.');
  } else if (action === 'verify') await verify();
  else if (action === 'status') {
    await clients();
    console.log('portal-tests is running. API: ' + apiUrl + '; Studio: http://127.0.0.1:55433; mail: http://127.0.0.1:55434');
  } else if (action === 'app') {
    const { publicKey } = await clients();
    console.log('Starting the app against portal-tests at http://127.0.0.1:5174');
    await run(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--mode', 'test', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], {
      live: true,
      env: { ...childEnv, VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: publicKey, VITE_APP_ENV: 'production', APP_ENV: 'test', DEMO_RESET_ENABLED: 'false' },
    });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Real HTTP integration assertions must never use a hosted URL or service-role
// identity. Only fixture creation/cleanup uses the separate admin client.
export function localClients() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const workspace = path.join(root, '.test-env');
  if (!/^project_id = "portal-tests"$/m.test(readFileSync(path.join(workspace, 'supabase/config.toml'), 'utf8')) ||
      existsSync(path.join(workspace, 'supabase/.temp/project-ref'))) throw new Error('Expected an unlinked portal-tests workspace.');
  const candidates = process.platform === 'win32' ? [path.join(process.env.LOCALAPPDATA || '', 'Programs/DockerDesktop/resources/bin/docker.exe'), 'C:/Program Files/Docker/Docker/resources/bin/docker.exe'] : [];
  const docker = candidates.find(candidate => existsSync(candidate)) || 'docker';
  const env = { ...process.env, PATH: `${path.dirname(docker)}${path.delimiter}${process.env.PATH || ''}` };
  delete env.SUPABASE_CLI_BINARY_OVERRIDE;
  const run = (binary, args) => execFileSync(binary, args, { cwd: root, env, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const endpoint = process.env.DOCKER_HOST || JSON.parse(run(docker, ['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}']));
  if (!/^(unix:|npipe:)/.test(endpoint)) throw new Error('Remote Docker is forbidden for these tests.');
  const labels = JSON.parse(run(docker, ['inspect', 'supabase_db_portal-tests', '--format', '{{json .Config.Labels}}']));
  if (labels['com.supabase.cli.project'] !== 'portal-tests') throw new Error('Wrong local database container.');
  const status = JSON.parse(run(process.execPath, [path.join(root, 'node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json', '--workdir', workspace]));
  if (status.API_URL !== 'http://127.0.0.1:55431' || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error('Unexpected test API configuration.');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    admin: createClient(status.API_URL, status.SERVICE_ROLE_KEY, options),
    client: () => createClient(status.API_URL, status.ANON_KEY, options),
    manifest: JSON.parse(readFileSync(path.join(workspace, 'fixtures.json'), 'utf8')),
  };
}

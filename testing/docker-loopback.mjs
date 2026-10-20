import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Docker Desktop can ignore a bridge's default host-binding option. Recreate
// only this disposable project's published containers with explicit HostIp.
// Named volumes are retained; existing non-test containers are never selected.
export async function ensureLoopback(run, docker, workspace) {
  const project = 'portal-tests';
  const endpoint = process.env.DOCKER_HOST || JSON.parse((await run(docker, ['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}'])).stdout);
  const socketPath = endpoint.startsWith('npipe:')
    ? endpoint.slice('npipe:'.length).replaceAll('/', '\\').replace(/^\\+/, '\\\\')
    : endpoint.startsWith('unix:') ? endpoint.slice('unix:'.length) : null;
  if (!socketPath) throw new Error('Explicit loopback bindings require a local Docker endpoint.');
  async function request(method, route, body) {
    const text = body ? JSON.stringify(body) : '';
    return new Promise((resolve, reject) => {
      const req = http.request({ socketPath, path: route, method, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) } }, res => {
        let response = '';
        res.on('data', data => { response += data; });
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`Docker ${method} ${route}: ${response}`));
          else resolve(response ? JSON.parse(response) : null);
        });
      });
      req.setTimeout(60000, () => req.destroy(new Error('Docker API timeout')));
      req.on('error', reject);
      req.end(text);
    });
  }
  async function start(name) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { return await request('POST', `/containers/${encodeURIComponent(name)}/start`); }
      catch (error) {
        // Docker Desktop's old port forwarder can linger briefly after removal.
        if (attempt === 4 || !error.message.includes('ports are not available')) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  const names = (await run(docker, ['ps', '-a', '--filter', `label=com.supabase.cli.project=${project}`, '--format', '{{.Names}}'])).stdout.trim().split('\n').filter(Boolean);
  for (const name of names) {
    if (!name.endsWith(`_${project}`)) throw new Error('Unexpected container in the test project.');
    const info = JSON.parse((await run(docker, ['inspect', name])).stdout)[0];
    if (info.Config.Labels?.['com.supabase.cli.project'] !== project) throw new Error('Container is not owned by portal-tests.');
    const ports = info.HostConfig.PortBindings || {};
    if (!Object.values(ports).flat().some(binding => binding.HostIp !== '127.0.0.1')) {
      if (!info.State.Running) await start(name);
      continue;
    }
    const bindings = Object.fromEntries(Object.entries(ports).map(([port, entries]) => [port, entries.map(binding => ({ ...binding, HostIp: '127.0.0.1' }))]));
    const payload = {
      ...info.Config,
      HostConfig: { ...info.HostConfig, PortBindings: bindings },
      NetworkingConfig: { EndpointsConfig: Object.fromEntries(Object.entries(info.NetworkSettings.Networks).map(([key, value]) => [key, { Aliases: value.Aliases }])) },
    };
    const recovery = path.join(workspace, 'docker-recovery');
    await mkdir(recovery, { recursive: true });
    await writeFile(path.join(recovery, `${name}.json`), JSON.stringify(payload));
    console.log(`Binding ${name} explicitly to 127.0.0.1 (retaining its volumes)...`);
    await request('POST', `/containers/${encodeURIComponent(name)}/stop?t=10`);
    // No force or volume deletion: the source stack and named data volumes survive.
    await request('DELETE', `/containers/${encodeURIComponent(name)}?v=false`);
    await request('POST', `/containers/create?name=${encodeURIComponent(name)}`, payload);
    await start(name);
  }
  for (const name of names) {
    const deadline = Date.now() + 90000;
    let ready = false;
    while (Date.now() < deadline) {
      const info = JSON.parse((await run(docker, ['inspect', name])).stdout)[0];
      const bindings = Object.values(info.NetworkSettings.Ports || {}).flat().filter(Boolean);
      if (bindings.some(binding => binding.HostIp !== '127.0.0.1')) throw new Error(`Non-loopback port detected on ${name}`);
      if (info.State.Running && (!info.State.Health || info.State.Health.Status === 'healthy')) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error(`Test service did not become healthy after binding: ${name}`);
  }
}

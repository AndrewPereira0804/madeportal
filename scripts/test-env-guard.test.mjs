import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test-env.mjs');
for (const args of [
  ['reset', '--linked'],
  ['reset', '--db-url', 'postgresql://example.invalid/postgres'],
  ['stop', '--all'],
  ['start', '--workdir', '../'],
  ['unknown'],
]) {
  test(`rejects unsafe or unknown invocation: ${args.join(' ')}`, () => {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Extra flags\/URLs are forbidden/);
    assert.doesNotMatch(result.stdout, /Starting|Rebuilding|Seeded/);
  });
}

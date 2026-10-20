import { execFileSync } from 'node:child_process';

export default function verifyCleanup() {
  execFileSync(process.execPath, ['scripts/test-env.mjs', 'verify'], {
    stdio: 'inherit', windowsHide: true,
  });
}

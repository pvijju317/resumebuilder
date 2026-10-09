import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/** Apply migrations to the test database once per run. */
export default function setup() {
  config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });
  const url = process.env['DATABASE_URL_TEST'];
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(import.meta.dirname, '../../../packages/db'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

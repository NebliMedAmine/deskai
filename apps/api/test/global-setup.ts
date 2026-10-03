import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { resolveTestDatabaseUrl } from './test-env';

/** Runs once before all e2e suites: bring the test database schema up to date. */
export default function globalSetup(): void {
  const url = resolveTestDatabaseUrl();
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

/** Loads apps/api/.env and returns the test database URL, refusing to run against the dev database. */
export function resolveTestDatabaseUrl(): string {
  loadDotenv({ path: resolve(__dirname, '../.env'), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set (see .env.example). E2E tests need their own database.',
    );
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error(
      'TEST_DATABASE_URL must differ from DATABASE_URL: e2e tests wipe the database.',
    );
  }
  return url;
}

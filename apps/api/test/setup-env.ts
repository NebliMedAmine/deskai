import { resolveTestDatabaseUrl } from './test-env';

// Runs in every test worker before the app is imported. Real env vars win over .env in ConfigModule.
process.env.DATABASE_URL = resolveTestDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '4'; // keep hashing fast in tests

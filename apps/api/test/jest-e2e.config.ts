import type { Config } from 'jest';

// E2E tests: boot the full Nest app against the TEST_DATABASE_URL Postgres database.
const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.spec.json' }],
  },
  moduleNameMapper: {
    '^@deskai/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
  },
  globalSetup: '<rootDir>/global-setup.ts',
  setupFiles: ['reflect-metadata', '<rootDir>/setup-env.ts'],
  testTimeout: 30_000,
};

export default config;

import type { Config } from 'jest';

// Unit tests: no database, no network. Prisma is replaced by a deep mock.
const config: Config = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['reflect-metadata'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.spec.json' }],
  },
  // Resolve the shared package from source so tests don't depend on a prior build.
  moduleNameMapper: {
    '^@deskai/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!generated/**', '!main.ts'],
  coverageDirectory: '../coverage',
};

export default config;

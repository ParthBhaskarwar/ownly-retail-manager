/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  testMatch: ['**/tests/**/*.test.ts'],
  // Integration tests share one Postgres database, so they must not run
  // concurrently — see the --runInBand flag in package.json's test script.
  testTimeout: 60000,
  globals: {
    'ts-jest': {
      // Use the test-specific tsconfig so Jest types (describe, it, expect)
      // are available and test files outside src/ are not excluded.
      tsconfig: './tsconfig.test.json',
    },
  },
};

module.exports = config;

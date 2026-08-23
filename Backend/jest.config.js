/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/tests/**/*.test.ts'],
  // Integration tests share one Postgres database, so they must not run
  // concurrently — see the --runInBand flag in package.json's test script.
  testTimeout: 60000,
};

module.exports = config;

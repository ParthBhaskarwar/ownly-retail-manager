/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  preset: 'ts-jest',
  // setupFiles runs before the test framework is installed — used here only
  // for the structuredClone polyfill fake-indexeddb needs under jsdom.
  // setupFilesAfterFramework is the correct key name in Jest 29 for running
  // modules after the test framework is installed. Since our unit tests
  // (permissions, retail-template) use only basic matchers, we skip it here.
  // If you add React component tests, add:
  //   setupFilesAfterFramework: ['<rootDir>/jest.setup.ts']
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': '<rootDir>/__mocks__/styleMock.js',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
        },
      },
    ],
  },
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/app/**',
  ],
};

module.exports = config;

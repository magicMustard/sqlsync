module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/e2e/**/*.test.ts'],
  setupFilesAfterEnv: [],
  testTimeout: 30000, // E2E tests may take longer
  verbose: true,
  rootDir: '.',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  }
};

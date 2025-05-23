module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./jest.setup.js'],
  testMatch: ['**/tests/**/*.test.js', '**/*.test.js'],
  coverageDirectory: './coverage',
  verbose: true
};
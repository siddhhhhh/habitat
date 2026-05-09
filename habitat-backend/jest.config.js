/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  rootDir: ".",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.ts"],
  setupFiles: ["<rootDir>/src/__tests__/jest.env.ts"],
  globalSetup: "<rootDir>/src/__tests__/jest.global-setup.ts",
  globalTeardown: "<rootDir>/src/__tests__/jest.global-teardown.ts",
  testTimeout: 30000,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/__tests__/**",
    "!src/types/**",
    "!src/server.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "json-summary"],
  forceExit: true,
};

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 20_000,
    // DB-backed tests share one test database; run files serially.
    fileParallelism: false,
  },
});

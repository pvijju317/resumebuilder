import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json-summary'],
      // Fact Guard is the trust feature: TRD §6.3 requires ≥95% branch coverage.
      thresholds: {
        'src/fact-guard/**': { branches: 95, lines: 95, functions: 95, statements: 95 },
      },
    },
  },
});

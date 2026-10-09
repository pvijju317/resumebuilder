import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the real stack: `docker compose up -d` (Postgres, Redis, Mailpit), migrated DB.
 * Playwright starts api + web unless they are already running.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  // The local OTP log fallback cannot tell parallel sign-ins apart; Mailpit (CI) can.
  ...(process.env['E2E_OTP_LOG'] ? { workers: 1 } : {}),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @tailor/api start',
      url: 'http://localhost:4000/api/v1/health',
      // The suite signs in many times from one IP; production limits stay in .env.
      env: { AUTH_RATE_LIMIT_PER_MIN: '200', OTP_REQUESTS_PER_EMAIL_PER_HOUR: '50' },
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @tailor/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});

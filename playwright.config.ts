import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    // Use an installed browser when given (e.g. PW_CHANNEL=msedge), else Playwright's Chromium.
    channel: process.env.PW_CHANNEL || undefined,
    baseURL: 'http://localhost:4173/pitwall-car/',
    locale: 'tr-TR',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'pnpm --filter @pitwall/web build && pnpm --filter @pitwall/web preview --port 4173 --strictPort',
    url: 'http://localhost:4173/pitwall-car/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

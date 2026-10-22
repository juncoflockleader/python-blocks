import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  use: {
    baseURL, browserName: 'chromium', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure',
    // Feature tests exercise every tool, so they start at the Pro level. Level tests opt out with their own storage state.
    storageState: { cookies: [], origins: [{ origin: baseURL, localStorage: [{ name: 'python-blocks-level', value: 'pro' }] }] },
  },
  webServer: [
    { command: 'pnpm preview', url: baseURL, reuseExistingServer: !process.env.CI },
    // The app as the Python Blocks server serves it, for the accounts tests: a fresh database and an admin.
    {
      command: `node -e "require('node:fs').rmSync('.test-server-data', { recursive: true, force: true })" && node server/main.ts`,
      env: { PORT: '4174', DATA_DIR: '.test-server-data', ADMIN_USERNAME: 'teacher', ADMIN_PASSWORD: 'teacher-pass' },
      url: 'http://127.0.0.1:4174/api/health', reuseExistingServer: !process.env.CI,
    },
  ],
});

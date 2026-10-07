import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure' },
  webServer: {
    command: 'pnpm preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});

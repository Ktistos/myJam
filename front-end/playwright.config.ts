import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173';
const webServer = process.env.PLAYWRIGHT_BASE_URL
  ? undefined
  : {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      url: baseURL,
      reuseExistingServer: true,
      timeout: 120000,
    };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT ?? '4173';
const HOST = process.env.HOST ?? '127.0.0.1';
const baseURL = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  reporter: process.env.CI
    ? [['junit', { outputFile: 'playwright-report/results.xml' }], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : 'list',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: `npm run dev -- --host ${HOST} --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe'
  }
});

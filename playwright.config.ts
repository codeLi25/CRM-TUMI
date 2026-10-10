import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', globalTeardown: './tests/teardown.ts', fullyParallel: false, workers: 1, timeout: 30000,
  use: { baseURL: 'http://localhost:5174', channel: process.env.PLAYWRIGHT_CHANNEL, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 1024 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    { command: 'npx tsx backend/test/browser-server.ts', url: 'http://127.0.0.1:3002/api/v1/health', timeout: 60000, reuseExistingServer: false },
    { command: 'npm run dev -w @tumi/web -- --port 5174', url: 'http://localhost:5174', env: { API_PROXY_TARGET: 'http://127.0.0.1:3002' }, timeout: 60000, reuseExistingServer: false },
  ],
});

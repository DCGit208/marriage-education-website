// Playwright Configuration for SBD Network Browser Tests
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './browser-tests',
  timeout: 60000, // 60 seconds per test
  retries: 1, // Retry failed tests once
  use: {
    baseURL: 'https://sbd-network.web.app',
    headless: true, // Run in headless mode
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  reporter: [
    ['list'],
    ['html', { outputFolder: 'browser-tests/playwright-report' }],
    ['json', { outputFile: 'browser-tests/test-results.json' }],
  ],
});

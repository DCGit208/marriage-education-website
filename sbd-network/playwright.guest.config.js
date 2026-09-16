// Local public-dir server for guest UX (cleanUrls/redirects are asserted in verify-guest-ux.js).
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './browser-tests',
  testMatch: '04-guest-ux.spec.js',
  timeout: 30000,
  retries: 0,
  webServer: {
    command: 'node scripts/guest-ux-host.js',
    url: 'http://127.0.0.1:4177/pricing',
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://127.0.0.1:4177',
    headless: true,
  },
  reporter: [['list']],
});

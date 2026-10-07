// Guest UX: public pricing, certificates must not flash member chrome.
const { test, expect } = require('@playwright/test');

test.describe('Guest UX (local public tree)', () => {
  test.beforeEach(({}, testInfo) => {
    const base = testInfo.project.use.baseURL || '';
    test.skip(!/127\.0\.0\.1|localhost/.test(base), 'Local public-dir server only — live CI smoke stays on /auth');
  });

  test('pricing page is a real public destination with live tiers', async ({ page }) => {
    const response = await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    expect(response && response.status()).toBe(200);
    await expect(page.locator('h1')).toContainText('Choose Your Level of Access');
    await expect(page.locator('body')).toContainText('$144.17');
    await expect(page.locator('body')).toContainText('$9.77');
    await expect(page.locator('body')).toContainText('$20');
    await expect(page.locator('body')).toContainText('$50');
    await expect(page.locator('[data-tier="premium"]')).toBeVisible();
  });

  test('site root lands on the public dashboard, not auth', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/dashboard/);
    const html = await page.content();
    expect(html).toContain('Choose Your Level of Access');
    expect(html).not.toContain('id="loginForm"');
  });

  test('demo and backup URLs redirect away from public chrome', async ({ page }) => {
    for (const path of ['/paywall-demo', '/video-preview-demo', '/dashboard-old', '/mv-house-OLD-BACKUP']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/dashboard(?:\.html)?(?:[?#]|$)/);
    }
  });

  test('certificates does not flash Logout / My Certificates for guests', async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.removeItem('sbdUserId'); } catch (e) {}
    });

    let sawMemberChrome = false;
    page.on('framenavigated', async (frame) => {
      if (frame !== page.mainFrame()) return;
      try {
        const text = await frame.locator('body').innerText({ timeout: 250 });
        if (/My Certificates|Logout/.test(text) && !/Sign In|Create Account/.test(text)) {
          sawMemberChrome = true;
        }
      } catch (e) { /* navigating */ }
    });

    await page.goto('/certificates', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/auth/, { timeout: 8000 });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/My Certificates/);
    expect(sawMemberChrome).toBe(false);
    await expect(page.locator('#loginForm')).toBeVisible();
  });
});

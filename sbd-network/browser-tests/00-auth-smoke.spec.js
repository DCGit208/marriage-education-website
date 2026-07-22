// Critical path: /auth must load JS without console errors (signup + signin).
const { test, expect } = require('@playwright/test');

test.describe('Auth page smoke', () => {
  test('auth.js loads and sign-in form is usable', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err.message || err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/auth.html', { waitUntil: 'networkidle' });

    await expect(page.locator('#loginForm')).toBeVisible({ timeout: 10000 });

    const authReady = await page.evaluate(() => {
      return typeof firebase !== 'undefined' &&
        typeof firebase.auth === 'function' &&
        document.querySelector('input[type="email"], #loginEmail, #signupEmail') !== null;
    });
    expect(authReady).toBe(true);

    const syntaxErrors = errors.filter((e) =>
      /SyntaxError|Unexpected identifier|Missing catch or finally/i.test(e)
    );
    expect(syntaxErrors, `Console errors: ${errors.join(' | ')}`).toEqual([]);
  });
});

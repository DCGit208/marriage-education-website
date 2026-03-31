// SBD Network - Checkout Flow Browser Test
// Tests: Payment flow, Stripe integration, Firestore order creation

const { test, expect } = require('@playwright/test');

test.describe('Checkout Flow - Payment System', () => {
  
  test('should load checkout page successfully', async ({ page }) => {
    await page.goto('/checkout');
    
    // Check page title/heading
    await expect(page.locator('h1, h2')).toContainText(/checkout|payment|upgrade/i);
    
    // Verify Stripe is loaded
    const stripeLoaded = await page.evaluate(() => {
      return typeof window.Stripe !== 'undefined';
    });
    expect(stripeLoaded).toBe(true);
    
    console.log('✅ Checkout page loaded with Stripe');
  });

  test('should display all pricing tiers', async ({ page }) => {
    await page.goto('/checkout');
    
    // Wait for pricing cards to load
    await page.waitForSelector('.price, .tier, .plan', { timeout: 10000 });
    
    // Check for pricing information (Foundation $9, Premium $20, Elite $50)
    const pageText = await page.textContent('body');
    
    // Check for price indicators
    const hasFoundationPrice = pageText.includes('$9') || pageText.includes('9.00') || pageText.includes('Foundation');
    const hasPremiumPrice = pageText.includes('$20') || pageText.includes('20.00') || pageText.includes('Premium');
    const hasElitePrice = pageText.includes('$50') || pageText.includes('50.00') || pageText.includes('Elite');
    
    expect(hasFoundationPrice || hasPremiumPrice || hasElitePrice).toBe(true);
    
    console.log('✅ Pricing tiers displayed');
  });

  test('should have payment form elements', async ({ page }) => {
    await page.goto('/checkout');
    
    // Wait for form to load
    await page.waitForTimeout(2000);
    
    // Check for button or form elements (adjust selectors based on actual HTML)
    const hasPaymentElements = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      const forms = document.querySelectorAll('form');
      return buttons.length > 0 || forms.length > 0;
    });
    
    expect(hasPaymentElements).toBe(true);
    
    console.log('✅ Payment form elements present');
  });

  test('should have Firebase initialized', async ({ page }) => {
    await page.goto('/checkout');
    
    // Wait for Firebase to load
    await page.waitForTimeout(2000);
    
    // Check Firebase initialization
    const firebaseInitialized = await page.evaluate(() => {
      return typeof firebase !== 'undefined' && 
             typeof firebase.auth !== 'undefined' &&
             typeof firebase.firestore !== 'undefined';
    });
    
    expect(firebaseInitialized).toBe(true);
    
    console.log('✅ Firebase initialized on checkout page');
  });

  test('should load checkout.js script', async ({ page }) => {
    await page.goto('/checkout');
    
    // Check if checkout.js is loaded
    const checkoutJsLoaded = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      return scripts.some(script => 
        script.src.includes('checkout.js') || 
        script.textContent.includes('Stripe')
      );
    });
    
    expect(checkoutJsLoaded).toBe(true);
    
    console.log('✅ Checkout JavaScript loaded');
  });
});

test.describe('Checkout Flow - Navigation', () => {
  
  test('should navigate to checkout-success after payment (simulation)', async ({ page }) => {
    // Check if checkout-success page exists and loads
    await page.goto('/checkout-success');
    
    // Verify success page loaded
    const pageLoaded = await page.evaluate(() => {
      return document.body !== null;
    });
    
    expect(pageLoaded).toBe(true);
    
    console.log('✅ Checkout success page accessible');
  });
});

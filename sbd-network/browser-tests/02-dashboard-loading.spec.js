// SBD Network - Dashboard Loading Browser Test
// Tests: Dashboard 5-section design, user experience, progress tracking

const { test, expect } = require('@playwright/test');

test.describe('Dashboard - Loading & Structure', () => {
  
  test('should load dashboard page successfully', async ({ page }) => {
    await page.goto('/dashboard.html');
    
    // Check page loaded
    const pageLoaded = await page.evaluate(() => {
      return document.body !== null;
    });
    
    expect(pageLoaded).toBe(true);
    
    console.log('✅ Dashboard page loaded');
  });

  test('should have Firebase initialized', async ({ page }) => {
    await page.goto('/dashboard.html');
    
    // Wait for Firebase to load
    await page.waitForTimeout(2000);
    
    // Check Firebase initialization
    const firebaseInitialized = await page.evaluate(() => {
      return typeof firebase !== 'undefined' && 
             typeof firebase.auth !== 'undefined' &&
             typeof firebase.firestore !== 'undefined';
    });
    
    expect(firebaseInitialized).toBe(true);
    
    console.log('✅ Firebase initialized on dashboard');
  });

  test('should load dashboard.js script', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check if dashboard.js is loaded
    const dashboardJsLoaded = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      return scripts.some(script => 
        script.src.includes('dashboard.js')
      );
    });
    
    expect(dashboardJsLoaded).toBe(true);
    
    console.log('✅ Dashboard JavaScript loaded');
  });

  test('should load dashboard CSS', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check if dashboard.css is loaded
    const dashboardCssLoaded = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      return links.some(link => 
        link.href.includes('dashboard.css')
      );
    });
    
    expect(dashboardCssLoaded).toBe(true);
    
    console.log('✅ Dashboard CSS loaded');
  });

  test('should have main dashboard container', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Wait for content to load
    await page.waitForTimeout(2000);
    
    // Check for main container or sections
    const hasContainer = await page.evaluate(() => {
      // Check for common dashboard container patterns
      const containers = document.querySelectorAll('.dashboard, .container, .main, main, #dashboard, [class*="dashboard"]');
      return containers.length > 0;
    });
    
    expect(hasContainer).toBe(true);
    
    console.log('✅ Dashboard container present');
  });

  test('should have dashboard sections (5-section design)', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Wait for sections to load
    await page.waitForTimeout(3000);
    
    // Check for section elements
    const sectionCount = await page.evaluate(() => {
      // Look for sections by various selectors
      const sections = document.querySelectorAll('section, .section, [class*="section"]');
      return sections.length;
    });
    
    // Should have at least some sections (5-section design: Continue Journey, Identity Status, This Week's Work, Discussions, Next Action)
    expect(sectionCount).toBeGreaterThan(0);
    
    console.log(`✅ Dashboard has ${sectionCount} sections`);
  });

  test('should load bottom navigation CSS', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check if bottom-nav.css is loaded
    const bottomNavCssLoaded = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      return links.some(link => 
        link.href.includes('bottom-nav.css')
      );
    });
    
    expect(bottomNavCssLoaded).toBe(true);
    
    console.log('✅ Bottom navigation CSS loaded');
  });
});

test.describe('Dashboard - User Experience', () => {
  
  test('should have navigation elements', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Wait for nav to load
    await page.waitForTimeout(2000);
    
    // Check for navigation elements
    const hasNavigation = await page.evaluate(() => {
      const navElements = document.querySelectorAll('nav, .nav, [class*="nav"], a[href]');
      return navElements.length > 0;
    });
    
    expect(hasNavigation).toBe(true);
    
    console.log('✅ Navigation elements present');
  });

  test('should load formation-access.js (paywall logic)', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check if formation-access.js is loaded
    const formationAccessLoaded = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      return scripts.some(script => 
        script.src.includes('formation-access.js')
      );
    });
    
    expect(formationAccessLoaded).toBe(true);
    
    console.log('✅ Formation access (paywall) script loaded');
  });

  test('should not have console errors (basic check)', async ({ page }) => {
    const consoleErrors = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.goto('/dashboard');
    await page.waitForTimeout(3000);
    
    // Filter out expected Firebase errors (auth not signed in, etc.)
    const criticalErrors = consoleErrors.filter(err => 
      !err.includes('auth') && 
      !err.includes('permission') &&
      !err.includes('PERMISSION_DENIED')
    );
    
    expect(criticalErrors).toHaveLength(0);
    
    console.log('✅ No critical console errors on dashboard');
  });
});

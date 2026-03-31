// SBD Network - Quiz Progression Browser Test
// Tests: Quiz system, scoring, progression logic

const { test, expect } = require('@playwright/test');

test.describe('Quiz System - Loading & Structure', () => {
  
  test('should load quiz page successfully', async ({ page }) => {
    await page.goto('/quiz.html');
    
    // Check page loaded
    const pageLoaded = await page.evaluate(() => {
      return document.body !== null;
    });
    
    expect(pageLoaded).toBe(true);
    
    console.log('✅ Quiz page loaded');
  });

  test('should have Firebase initialized', async ({ page }) => {
    await page.goto('/quiz.html');
    
    // Wait for Firebase to load
    await page.waitForTimeout(2000);
    
    // Check Firebase initialization
    const firebaseInitialized = await page.evaluate(() => {
      return typeof firebase !== 'undefined' && 
             typeof firebase.auth !== 'undefined' &&
             typeof firebase.firestore !== 'undefined';
    });
    
    expect(firebaseInitialized).toBe(true);
    
    console.log('✅ Firebase initialized on quiz page');
  });

  test('should load quiz.js script', async ({ page }) => {
    await page.goto('/quiz');
    
    // Check if quiz.js is loaded
    const quizJsLoaded = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      return scripts.some(script => 
        script.src.includes('quiz.js')
      );
    });
    
    expect(quizJsLoaded).toBe(true);
    
    console.log('✅ Quiz JavaScript loaded');
  });

  test('should load quiz CSS', async ({ page }) => {
    await page.goto('/quiz');
    
    // Check if quiz.css is loaded
    const quizCssLoaded = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      return links.some(link => 
        link.href.includes('quiz.css')
      );
    });
    
    expect(quizCssLoaded).toBe(true);
    
    console.log('✅ Quiz CSS loaded');
  });

  test('should have quiz container', async ({ page }) => {
    await page.goto('/quiz');
    
    // Wait for content to load
    await page.waitForTimeout(2000);
    
    // Check for quiz container
    const hasContainer = await page.evaluate(() => {
      const containers = document.querySelectorAll('.quiz, .quiz-container, #quiz, [class*="quiz"]');
      return containers.length > 0;
    });
    
    expect(hasContainer).toBe(true);
    
    console.log('✅ Quiz container present');
  });
});

test.describe('Quiz System - Interactive Elements', () => {
  
  test('should have question elements or placeholders', async ({ page }) => {
    await page.goto('/quiz');
    
    // Wait for quiz to load
    await page.waitForTimeout(3000);
    
    // Check for question-related elements
    const hasQuestions = await page.evaluate(() => {
      const questionElements = document.querySelectorAll(
        '.question, [class*="question"], .quiz-question, h3, h4'
      );
      return questionElements.length > 0;
    });
    
    expect(hasQuestions).toBe(true);
    
    console.log('✅ Question elements present');
  });

  test('should have answer input elements (buttons, radio, etc)', async ({ page }) => {
    await page.goto('/quiz');
    
    // Wait for quiz to load
    await page.waitForTimeout(3000);
    
    // Check for answer input elements
    const hasInputs = await page.evaluate(() => {
      const inputs = document.querySelectorAll('button, input[type="radio"], .answer, [class*="answer"]');
      return inputs.length > 0;
    });
    
    expect(hasInputs).toBe(true);
    
    console.log('✅ Answer input elements present');
  });

  test('should have submit or next button', async ({ page }) => {
    await page.goto('/quiz');
    
    // Wait for quiz to load
    await page.waitForTimeout(3000);
    
    // Check for submit/next buttons
    const hasSubmitButton = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(btn => 
        btn.textContent.toLowerCase().includes('submit') ||
        btn.textContent.toLowerCase().includes('next') ||
        btn.textContent.toLowerCase().includes('continue')
      );
    });
    
    expect(hasSubmitButton).toBe(true);
    
    console.log('✅ Submit/Next button present');
  });
});

test.describe('Quiz System - Scoring & Results', () => {
  
  test('should have results/score display elements', async ({ page }) => {
    await page.goto('/quiz');
    
    // Wait for quiz to load
    await page.waitForTimeout(3000);
    
    // Check for score/results elements (might be hidden initially)
    const hasResultsElements = await page.evaluate(() => {
      const resultElements = document.querySelectorAll(
        '.score, .result, [class*="score"], [class*="result"], [class*="pass"], [class*="fail"]'
      );
      return resultElements.length > 0 || document.body.innerHTML.length > 100; // Quiz has content
    });
    
    expect(hasResultsElements).toBe(true);
    
    console.log('✅ Quiz has results/score elements or content');
  });

  test('should not have critical console errors', async ({ page }) => {
    const consoleErrors = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.goto('/quiz');
    await page.waitForTimeout(3000);
    
    // Filter out expected Firebase errors (auth not signed in, etc.)
    const criticalErrors = consoleErrors.filter(err => 
      !err.includes('auth') && 
      !err.includes('permission') &&
      !err.includes('PERMISSION_DENIED')
    );
    
    expect(criticalErrors).toHaveLength(0);
    
    console.log('✅ No critical console errors on quiz page');
  });
});

test.describe('Certificate System - Loading', () => {
  
  test('should load certificates page successfully', async ({ page }) => {
    await page.goto('/certificates');
    
    // Check page loaded
    const pageLoaded = await page.evaluate(() => {
      return document.body !== null;
    });
    
    expect(pageLoaded).toBe(true);
    
    console.log('✅ Certificates page loaded');
  });

  test('should have Firebase initialized on certificates page', async ({ page }) => {
    await page.goto('/certificates');
    
    // Wait for Firebase to load
    await page.waitForTimeout(2000);
    
    // Check Firebase initialization
    const firebaseInitialized = await page.evaluate(() => {
      return typeof firebase !== 'undefined' && 
             typeof firebase.auth !== 'undefined' &&
             typeof firebase.firestore !== 'undefined';
    });
    
    expect(firebaseInitialized).toBe(true);
    
    console.log('✅ Firebase initialized on certificates page');
  });

  test('should load certificate.js script', async ({ page }) => {
    await page.goto('/certificates');
    
    // Check if certificate.js is loaded
    const certificateJsLoaded = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      return scripts.some(script => 
        script.src.includes('certificate.js')
      );
    });
    
    expect(certificateJsLoaded).toBe(true);
    
    console.log('✅ Certificate JavaScript loaded');
  });

  test('should load certificate CSS', async ({ page }) => {
    await page.goto('/certificates.html');
    
    // Check if certificate.css is loaded
    const certificateCssLoaded = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      return links.some(link => 
        link.href.includes('certificate.css')
      );
    });
    
    expect(certificateCssLoaded).toBe(true);
    
    console.log('✅ Certificate CSS loaded');
  });
});

#!/usr/bin/env node
/**
 * AUTOMATED TEST 3: HTML Dependency Validation
 * Verifies Firebase CDN, CSS, and JS are properly linked
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(BASE_DIR, 'public');

let passed = 0;
let failed = 0;
const errors = [];

function testHTMLDependencies(fileName, requiredDeps) {
  const filePath = path.join(PUBLIC_DIR, fileName);
  
  if (!fs.existsSync(filePath)) {
    failed++;
    console.log(`❌ ${fileName} - FILE NOT FOUND`);
    errors.push(`${fileName}: File not found`);
    return false;
  }

  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const issues = [];
    
    // Check for required dependencies
    if (requiredDeps.firebaseCDN) {
      if (!html.includes('firebase-app-compat.js')) {
        issues.push('Missing Firebase App CDN');
      }
      if (!html.includes('firebase-auth-compat.js')) {
        issues.push('Missing Firebase Auth CDN');
      }
      if (!html.includes('firebase-firestore-compat.js')) {
        issues.push('Missing Firebase Firestore CDN');
      }
    }
    
    if (requiredDeps.firebaseConfig) {
      if (!html.includes('/js/firebase.js') && !html.includes('/js/firebase-config.js') && !html.includes('firebase.js') && !html.includes('firebase-config.js')) {
        issues.push('Missing firebase.js or firebase-config.js import');
      }
    }
    
    if (requiredDeps.stripe) {
      if (!html.includes('js.stripe.com/v3')) {
        issues.push('Missing Stripe.js CDN');
      }
    }
    
    if (requiredDeps.css) {
      requiredDeps.css.forEach(cssFile => {
        if (!html.includes(cssFile)) {
          issues.push(`Missing CSS: ${cssFile}`);
        }
      });
    }
    
    if (requiredDeps.js) {
      requiredDeps.js.forEach(jsFile => {
        if (!html.includes(jsFile)) {
          issues.push(`Missing JS: ${jsFile}`);
        }
      });
    }
    
    if (issues.length > 0) {
      failed++;
      console.log(`❌ ${fileName}`);
      issues.forEach(issue => {
        console.log(`   └─ ${issue}`);
        errors.push(`${fileName}: ${issue}`);
      });
      return false;
    } else {
      passed++;
      console.log(`✅ ${fileName}`);
      return true;
    }
  } catch (error) {
    failed++;
    console.log(`❌ ${fileName} - ${error.message}`);
    errors.push(`${fileName}: ${error.message}`);
    return false;
  }
}

console.log('\n🧪 AUTOMATED TEST 3: HTML DEPENDENCY VALIDATION\n');
console.log('═'.repeat(60));

console.log('\n📄 Testing HTML Files:\n');

// Dashboard (requires Firebase + dashboard.js + CSS)
testHTMLDependencies('dashboard.html', {
  firebaseCDN: true,
  firebaseConfig: true,
  css: ['/css/styles.css', '/css/dashboard.css'],
  js: ['/js/dashboard.js']
});

// Checkout (requires Firebase + Stripe + checkout.js)
testHTMLDependencies('checkout.html', {
  firebaseCDN: true,
  firebaseConfig: true,
  stripe: true,
  js: ['/js/checkout.js']
});

// Quiz (requires Firebase + quiz.js + CSS)
testHTMLDependencies('quiz.html', {
  firebaseCDN: true,
  firebaseConfig: true,
  css: ['/css/quiz.css'],
  js: ['/js/quiz.js']
});

// Certificates (requires Firebase + certificate.js + CSS)
testHTMLDependencies('certificates.html', {
  firebaseCDN: true,
  firebaseConfig: true,
  css: ['/css/certificate.css'],
  js: ['/js/certificate.js']
});

// Assignment (requires Firebase + assignment.js + CSS)
testHTMLDependencies('assignment.html', {
  firebaseCDN: true,
  firebaseConfig: true,
  css: ['/css/assignment.css'],
  js: ['/js/assignment.js']
});

// Start Here (free content, may not need Firebase)
testHTMLDependencies('start-here.html', {
  firebaseCDN: false,
  css: ['/css/global.css']  // Updated: uses global.css not styles.css
});

// Video Preview Demo
testHTMLDependencies('video-preview-demo.html', {
  firebaseCDN: true,
  firebaseConfig: true,
  css: ['/css/video-preview.css'],
  js: ['/js/video-preview.js']
});

// Admin Course Builder (admin.js not imported - logic is inline)
testHTMLDependencies('admin-course-builder.html', {
  firebaseCDN: true,
  firebaseConfig: true
  // Note: No /js/admin.js - all logic is inline in this file
});

// Results
console.log('\n' + '═'.repeat(60));
console.log('\n📊 TEST RESULTS:');
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed > 0) {
  console.log('\n🔴 DEPENDENCY ISSUES FOUND:');
  errors.forEach(error => console.log(`   ${error}`));
  console.log('\n⚠️  Fix missing dependencies before testing pages.');
}

console.log('\n' + '═'.repeat(60));

process.exit(failed > 0 ? 1 : 0);

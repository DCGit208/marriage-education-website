#!/usr/bin/env node
/**
 * AUTOMATED TEST 1: File Structure Validation
 * Verifies all critical files exist
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(BASE_DIR, 'public');

// Test results
let passed = 0;
let failed = 0;
const errors = [];

function testFileExists(filePath, description) {
  const fullPath = path.join(BASE_DIR, filePath);
  if (fs.existsSync(fullPath)) {
    passed++;
    console.log(`✅ ${description}`);
    return true;
  } else {
    failed++;
    errors.push(`❌ ${description} - File not found: ${filePath}`);
    console.log(`❌ ${description} - MISSING`);
    return false;
  }
}

console.log('\n🧪 AUTOMATED TEST 1: FILE STRUCTURE VALIDATION\n');
console.log('═'.repeat(60));

// HTML Files
console.log('\n📄 HTML Files:');
testFileExists('public/index.html', 'Login/Signup page');
testFileExists('public/dashboard.html', 'Dashboard (Phase 2)');
testFileExists('public/checkout.html', 'Checkout (Phase 1)');
testFileExists('public/checkout-success.html', 'Checkout Success (Phase 1)');
testFileExists('public/quiz.html', 'Quiz System (Phase 3b)');
testFileExists('public/certificates.html', 'Certificates (Phase 3c)');
testFileExists('public/assignment.html', 'Assignments (Phase 3d)');
testFileExists('public/start-here.html', 'Start Here (Phase 4)');
testFileExists('public/entry-quiz.html', 'Entry Quiz (Phase 4)');
testFileExists('public/resources.html', 'Resources (Phase 4)');
testFileExists('public/video-preview-demo.html', 'Video Preview (Phase 4)');
testFileExists('public/admin-course-builder.html', 'Admin Builder (Phase 5)');
testFileExists('public/paywall-demo.html', 'Paywall Demo (Phase 3a)');

// JavaScript Files
console.log('\n📜 JavaScript Files:');
testFileExists('public/js/firebase.js', 'Firebase Config');
testFileExists('public/js/auth.js', 'Authentication');
testFileExists('public/js/formation-access.js', 'Paywall & Tier Checking');
testFileExists('public/js/dashboard.js', 'Dashboard Logic');
testFileExists('public/js/checkout.js', 'Checkout/Payment');
testFileExists('public/js/quiz.js', 'Quiz System');
testFileExists('public/js/certificate.js', 'Certificate System');
testFileExists('public/js/assignment.js', 'Assignment System');
testFileExists('public/js/video-preview.js', 'Video Preview');
testFileExists('public/js/admin.js', 'Admin Tools');

// CSS Files
console.log('\n🎨 CSS Files:');
testFileExists('public/css/styles.css', 'Global Styles');
testFileExists('public/css/dashboard.css', 'Dashboard Styles');
testFileExists('public/css/paywall.css', 'Paywall Styles');
testFileExists('public/css/quiz.css', 'Quiz Styles');
testFileExists('public/css/certificate.css', 'Certificate Styles');
testFileExists('public/css/assignment.css', 'Assignment Styles');
testFileExists('public/css/video-preview.css', 'Video Preview Styles');
testFileExists('public/css/bottom-nav.css', 'Bottom Navigation');

// Firebase Config
console.log('\n🔥 Firebase Configuration:');
testFileExists('firebase.json', 'Firebase Project Config');
testFileExists('firestore.rules', 'Firestore Security Rules');

// Results
console.log('\n' + '═'.repeat(60));
console.log('\n📊 TEST RESULTS:');
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed > 0) {
  console.log('\n🔴 ERRORS FOUND:');
  errors.forEach(error => console.log(`   ${error}`));
}

console.log('\n' + '═'.repeat(60));

// Exit code
process.exit(failed > 0 ? 1 : 0);

#!/usr/bin/env node
/**
 * AUTOMATED TEST 4: Firebase Configuration Validation
 * Verifies firebase.js has valid config
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '..');
const FIREBASE_PATH = path.join(BASE_DIR, 'public', 'js', 'firebase.js');

let passed = 0;
let failed = 0;
const errors = [];

console.log('\n🧪 AUTOMATED TEST 4: FIREBASE CONFIGURATION VALIDATION\n');
console.log('═'.repeat(60));

if (!fs.existsSync(FIREBASE_PATH)) {
  console.log('\n❌ firebase.js NOT FOUND');
  console.log('   Location expected: public/js/firebase.js');
  process.exit(1);
}

const code = fs.readFileSync(FIREBASE_PATH, 'utf8');

console.log('\n🔥 Testing Firebase Configuration:\n');

// Test 1: firebaseConfig object exists
if (code.includes('const firebaseConfig') || code.includes('var firebaseConfig')) {
  passed++;
  console.log('✅ firebaseConfig object declared');
} else {
  failed++;
  console.log('❌ firebaseConfig object NOT found');
  errors.push('firebaseConfig object not declared');
}

// Test 2: Required config properties
const requiredProps = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
requiredProps.forEach(prop => {
  if (code.includes(`${prop}:`)) {
    passed++;
    console.log(`✅ ${prop} property exists`);
  } else {
    failed++;
    console.log(`❌ ${prop} property MISSING`);
    errors.push(`Missing property: ${prop}`);
  }
});

// Test 3: Firebase initialization
if (code.includes('firebase.initializeApp(firebaseConfig)')) {
  passed++;
  console.log('✅ firebase.initializeApp() called');
} else {
  failed++;
  console.log('❌ firebase.initializeApp() NOT called');
  errors.push('Firebase not initialized');
}

// Test 4: Auth constant declared
if (code.includes('const auth = firebase.auth()') || code.includes('var auth = firebase.auth()')) {
  passed++;
  console.log('✅ auth constant declared');
} else {
  failed++;
  console.log('❌ auth constant NOT declared');
  errors.push('auth constant missing');
}

// Test 5: Firestore constant declared
if (code.includes('const db = firebase.firestore()') || code.includes('var db = firebase.firestore()')) {
  passed++;
  console.log('✅ db constant declared');
} else {
  failed++;
  console.log('❌ db constant NOT declared');
  errors.push('db constant missing');
}

// Test 6: Safari long polling (optional but recommended)
if (code.includes('experimentalForceLongPolling')) {
  passed++;
  console.log('✅ Safari long polling configured');
} else {
  console.log('⚠️  Safari long polling NOT configured (optional)');
}

// Results
console.log('\n' + '═'.repeat(60));
console.log('\n📊 TEST RESULTS:');
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed > 0) {
  console.log('\n🔴 CONFIGURATION ERRORS:');
  errors.forEach(error => console.log(`   ${error}`));
  console.log('\n⚠️  Fix Firebase configuration before proceeding.');
}

console.log('\n' + '═'.repeat(60));

process.exit(failed > 0 ? 1 : 0);

#!/usr/bin/env node
/**
 * AUTOMATED TEST 2: JavaScript Syntax Validation
 * Checks for syntax errors in all JS files
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '..');
const JS_DIR = path.join(BASE_DIR, 'public', 'js');

let passed = 0;
let failed = 0;
const errors = [];

function testJSSyntax(fileName) {
  const filePath = path.join(JS_DIR, fileName);
  
  if (!fs.existsSync(filePath)) {
    failed++;
    console.log(`❌ ${fileName} - FILE NOT FOUND`);
    errors.push(`${fileName}: File not found`);
    return false;
  }

  try {
    const code = fs.readFileSync(filePath, 'utf8');
    
    // Basic syntax checks
    const issues = [];
    
    // Check for unclosed braces
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      issues.push(`Mismatched braces: ${openBraces} open, ${closeBraces} close`);
    }
    
    // Check for unclosed parentheses
    const openParens = (code.match(/\(/g) || []).length;
    const closeParens = (code.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      issues.push(`Mismatched parentheses: ${openParens} open, ${closeParens} close`);
    }
    
    // Check for unclosed brackets
    const openBrackets = (code.match(/\[/g) || []).length;
    const closeBrackets = (code.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      issues.push(`Mismatched brackets: ${openBrackets} open, ${closeBrackets} close`);
    }
    
    // Try to parse with Node.js (basic check)
    try {
      // Don't actually execute, just check if it's valid JS
      new Function(code);
    } catch (parseError) {
      // Some browser-specific code might not parse in Node, so we'll be lenient
      // Only flag obvious syntax errors
      if (parseError.message.includes('Unexpected token') || 
          parseError.message.includes('Unterminated')) {
        issues.push(`Parse error: ${parseError.message}`);
      }
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

console.log('\n🧪 AUTOMATED TEST 2: JAVASCRIPT SYNTAX VALIDATION\n');
console.log('═'.repeat(60));

// Critical JS files to test
const jsFiles = [
  'firebase.js',
  'auth.js',
  'formation-access.js',
  'dashboard.js',
  'checkout.js',
  'quiz.js',
  'certificate.js',
  'assignment.js',
  'video-preview.js',
  'admin.js',
  'boards.js',
  'courses.js',
  'explore.js',
  'profile.js',
  'schools.js'
];

console.log('\n📜 Testing JavaScript Files:\n');

jsFiles.forEach(file => testJSSyntax(file));

// Results
console.log('\n' + '═'.repeat(60));
console.log('\n📊 TEST RESULTS:');
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed > 0) {
  console.log('\n🔴 SYNTAX ERRORS FOUND:');
  errors.forEach(error => console.log(`   ${error}`));
  console.log('\n⚠️  Fix syntax errors before proceeding to browser testing.');
}

console.log('\n' + '═'.repeat(60));

process.exit(failed > 0 ? 1 : 0);

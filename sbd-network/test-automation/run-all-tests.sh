#!/bin/bash
##############################################################################
# AUTOMATED TEST SUITE
# Runs all validation tests in sequence
##############################################################################

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                    SBD NETWORK - AUTOMATED TEST SUITE                     ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Change to test directory
cd "$(dirname "$0")"

# Track results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run test and track results
run_test() {
  local test_file=$1
  local test_name=$2
  
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  if node "$test_file"; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
    echo ""
    echo "✅ $test_name PASSED"
  else
    FAILED_TESTS=$((FAILED_TESTS + 1))
    echo ""
    echo "❌ $test_name FAILED"
    # Continue to next test even if one fails
  fi
  
  echo ""
  echo "────────────────────────────────────────────────────────────────────────────"
}

# Run all tests
run_test "01-file-structure-test.js" "TEST 1: File Structure"
run_test "02-javascript-syntax-test.js" "TEST 2: JavaScript Syntax"
run_test "03-html-dependencies-test.js" "TEST 3: HTML Dependencies"
run_test "04-firebase-config-test.js" "TEST 4: Firebase Configuration"

# Final results
echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                            FINAL TEST RESULTS                              ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "   Total Tests:  $TOTAL_TESTS"
echo "   ✅ Passed:    $PASSED_TESTS"
echo "   ❌ Failed:    $FAILED_TESTS"

if [ $FAILED_TESTS -eq 0 ]; then
  echo ""
  echo "   🎉 ALL TESTS PASSED!"
  echo "   ✅ Ready for browser testing"
  echo ""
  exit 0
else
  echo ""
  echo "   ⚠️  SOME TESTS FAILED"
  echo "   🔴 Fix errors before proceeding"
  echo ""
  exit 1
fi

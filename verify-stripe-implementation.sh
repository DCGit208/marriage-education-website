#!/bin/bash

# Stripe Payment Implementation Verification Script
# This script verifies that the Stripe implementation is clean and properly configured

echo "🔍 Verifying Stripe Payment Implementation..."
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Check 1: Verify payment.html exists
echo -n "✓ Checking payment.html exists... "
if [ -f "payment.html" ]; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    ((ERRORS++))
fi

# Check 2: Verify no PayPal references in payment.html
echo -n "✓ Checking for PayPal references in payment.html... "
PAYPAL_COUNT=$(grep -ci "paypal" payment.html || true)
if [ "$PAYPAL_COUNT" -eq 0 ]; then
    echo -e "${GREEN}PASS (0 references)${NC}"
else
    echo -e "${RED}FAIL ($PAYPAL_COUNT references found)${NC}"
    ((ERRORS++))
fi

# Check 3: Verify Stripe.js is loaded
echo -n "✓ Checking Stripe.js is loaded... "
if grep -q "js.stripe.com/v3" payment.html; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    ((ERRORS++))
fi

# Check 4: Verify card-element exists
echo -n "✓ Checking card-element div exists... "
if grep -q 'id="card-element"' payment.html; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    ((ERRORS++))
fi

# Check 5: Check for duplicate #card-element in CSS
echo -n "✓ Checking for duplicate #card-element in CSS... "
CARD_ELEMENT_COUNT=$(grep -c "^#card-element" style.css || true)
if [ "$CARD_ELEMENT_COUNT" -eq 1 ]; then
    echo -e "${GREEN}PASS (1 definition)${NC}"
else
    echo -e "${YELLOW}WARNING ($CARD_ELEMENT_COUNT definitions)${NC}"
    ((WARNINGS++))
fi

# Check 6: Check for duplicate #card-errors in CSS
echo -n "✓ Checking for duplicate #card-errors in CSS... "
CARD_ERRORS_COUNT=$(grep -c "^#card-errors" style.css || true)
if [ "$CARD_ERRORS_COUNT" -eq 1 ]; then
    echo -e "${GREEN}PASS (1 definition)${NC}"
else
    echo -e "${YELLOW}WARNING ($CARD_ERRORS_COUNT definitions)${NC}"
    ((WARNINGS++))
fi

# Check 7: Verify analytics.js is the only extra script
echo -n "✓ Checking payment.html loads minimal scripts... "
SCRIPT_COUNT=$(grep -c "script src=" payment.html || true)
if [ "$SCRIPT_COUNT" -eq 2 ]; then
    echo -e "${GREEN}PASS (2 scripts: Stripe.js + analytics.js)${NC}"
else
    echo -e "${YELLOW}WARNING ($SCRIPT_COUNT scripts loaded)${NC}"
    ((WARNINGS++))
fi

# Check 8: Verify test files are excluded in .gitignore
echo -n "✓ Checking .gitignore excludes test files... "
if grep -q "test-pages/" .gitignore && grep -q "*-test.html" .gitignore; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${YELLOW}WARNING (test files may not be excluded)${NC}"
    ((WARNINGS++))
fi

# Check 9: Verify StripeElement CSS exists
echo -n "✓ Checking StripeElement CSS exists... "
if grep -q "\.StripeElement {" style.css; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    ((ERRORS++))
fi

# Check 10: Verify live Stripe key is used
echo -n "✓ Checking Stripe live key is configured... "
if grep -q "pk_live_" payment.html; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${YELLOW}WARNING (using test key)${NC}"
    ((WARNINGS++))
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Verification Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Errors:   ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
echo ""

if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Stripe implementation is clean.${NC}"
    exit 0
elif [ "$ERRORS" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  All critical checks passed with $WARNINGS warnings.${NC}"
    exit 0
else
    echo -e "${RED}❌ Found $ERRORS critical errors. Please fix before deploying.${NC}"
    exit 1
fi

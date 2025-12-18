#!/bin/bash
# Fix payment.html links to include product IDs based on data-role

sed -i '' \
  -e 's|href="payment.html" class="buy-button" data-role="cta-\([^"]*\)"|href="payment.html?product=\1\&price=49" class="buy-button" data-role="cta-\1"|g' \
  courses.html

echo "Fixed payment links"

#!/bin/bash

# Validate Firestore Rules - Check for missing collection rules
# Run this before deploying to catch missing permissions

echo "🔍 Scanning codebase for Firestore collections..."

# Find all .collection() calls in public/ folder (macOS-compatible)
collections=$(grep -rho "\.collection(['\"][^'\"]*['\"])" public/ --include="*.html" --include="*.js" 2>/dev/null | \
    sed "s/\.collection(['\"]//g" | \
    sed "s/['\"])//g" | \
    sort -u)

echo ""
echo "📋 Collections found in code:"
if [ -z "$collections" ]; then
    echo "  (none found - check if public/ folder exists)"
else
    echo "$collections" | sed 's/^/  - /'
fi

echo ""
echo "🔒 Checking firestore.rules..."

missing=0
for collection in $collections; do
    if [ -z "$collection" ]; then
        continue
    fi
    
    if ! grep -q "match /$collection/" firestore.rules; then
        echo "  ❌ Missing rule: $collection"
        missing=$((missing + 1))
    else
        echo "  ✅ Rule exists: $collection"
    fi
done

echo ""
if [ $missing -eq 0 ]; then
    echo "✨ All collections have rules defined!"
    exit 0
else
    echo "⚠️  $missing collection(s) missing rules!"
    echo ""
    echo "Add missing rules to firestore.rules, then run:"
    echo "  firebase deploy --only firestore:rules"
    exit 1
fi

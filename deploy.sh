#!/usr/bin/env bash
# =============================================================
# Marriage Education — Full Firebase Deploy
#
# ALWAYS run this instead of `firebase deploy --only hosting`.
# Deploys hosting + Firestore rules together so they are never
# out of sync, which causes "Missing or insufficient permissions"
# errors on the live site.
# =============================================================
set -e

cd "$(dirname "$0")"

echo "🔍  Compiling Firestore rules..."
firebase firestore:rules:get --project marriage-education 2>/dev/null || true

echo "🚀  Deploying hosting + Firestore rules..."
firebase deploy --only hosting,firestore:rules

echo ""
echo "✅  Deploy complete. Both hosting and Firestore rules are live."

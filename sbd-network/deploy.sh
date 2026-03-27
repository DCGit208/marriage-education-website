#!/usr/bin/env bash
# deploy.sh — bump SW version, sync changelog, deploy hosting
#
# Usage:
#   ./deploy.sh                                   (generic entry, hosting only)
#   ./deploy.sh --all                             (generic entry, full deploy)
#   ./deploy.sh "Title" "📋 Change 1" "🐛 Fix"   (custom What's New entry)
#   ./deploy.sh --all "Title" "📋 Change 1"       (full deploy + custom entry)
set -euo pipefail

cd "$(dirname "$0")"

# Separate --all flag from release-note args
DEPLOY_ALL=false
NOTE_ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "--all" ]]; then
    DEPLOY_ALL=true
  else
    NOTE_ARGS+=("$arg")
  fi
done

echo "▸ Bumping SW version & syncing changelog…"
node scripts/bump-sw-version.js "${NOTE_ARGS[@]}"

if [[ "$DEPLOY_ALL" == true ]]; then
  echo "▸ Deploying everything…"
  firebase deploy
else
  echo "▸ Deploying hosting…"
  firebase deploy --only hosting
fi

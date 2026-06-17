#!/usr/bin/env bash
# Restore CE2 message delivery to stable v90 and deploy hosting.
# Usage: ./sbd-network/scripts/rollback-ce2-delivery-v90.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TAG="ce2-delivery-stable-v90"
SB="$ROOT/sbd-network"

if ! git -C "$ROOT" rev-parse "$TAG" >/dev/null 2>&1; then
  echo "ERROR: git tag $TAG not found."
  echo "Pin versions from public/communication-v2/DELIVERY-STABLE.lock and deploy manually."
  echo "See public/communication-v2/ROLLBACK-DELIVERY-v90.md"
  exit 1
fi

git -C "$ROOT" checkout "$TAG" -- \
  sbd-network/public/communication-v2/communication-v2.js \
  sbd-network/public/communication-v2/ce2-presence.js \
  sbd-network/public/communication-v2/ce2-pwa.js \
  sbd-network/public/communication-v2/communication-v2.css \
  sbd-network/public/communication-v2/index.html \
  sbd-network/public/communication-v2/DELIVERY-STABLE.lock \
  sbd-network/public/communication-v2/ROLLBACK-DELIVERY-v90.md \
  sbd-network/public/communication-v2/DELIVERY-PERF-GUARDRAILS.md \
  sbd-network/public/js/firebase.js \
  sbd-network/public/js/notifications.js

cd "$SB"
firebase deploy --only hosting:sbd-network

echo "Done. Hard refresh https://sbd-network.web.app/communication-v2/ on all devices."

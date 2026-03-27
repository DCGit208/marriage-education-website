#!/bin/bash
# ================================================================
# sbd-upload-signer — Cloudflare Worker deployment script
#
# Run this once in a fresh terminal:
#   cd workers/upload-signer && bash deploy.sh
# ================================================================
set -e

WORKER_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$WORKER_DIR"

echo "📦 Installing wrangler..."
npm install

echo ""
echo "🔑 Setting R2 secrets (you will be prompted to paste each value)..."
echo ""

# These values come from scripts/.env
echo "Paste value for R2_ACCESS_KEY_ID when prompted:"
./node_modules/.bin/wrangler secret put R2_ACCESS_KEY_ID

echo ""
echo "Paste value for R2_SECRET_KEY when prompted:"
./node_modules/.bin/wrangler secret put R2_SECRET_KEY

echo ""
echo "🚀 Deploying worker..."
./node_modules/.bin/wrangler deploy

echo ""
echo "✅ Done! Copy the workers.dev URL printed above."
echo "   Then update UPLOAD_WORKER_URL in public/js/upload.js with that URL."
echo ""
echo "📋 Next — set R2 bucket CORS so browsers can PUT files:"
echo "   Run the curl command in set-r2-cors.sh"

#!/bin/bash
# ================================================================
# Set CORS policy on sbd-media R2 bucket so browsers can PUT files
# directly from https://marriage-education.web.app
#
# Requires a Cloudflare API Token with R2 write permissions.
# Get one at: https://dash.cloudflare.com/profile/api-tokens
# ================================================================

ACCOUNT_ID="f6a08b1c78739a7d3bc9f0672ad27e36"
BUCKET="sbd-media"

echo "Enter your Cloudflare API Token:"
read -r CF_TOKEN

curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/cors" \
  -H "Authorization: Bearer ${CF_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "rules": [
      {
        "allowed": {
          "origins": ["https://marriage-education.web.app"],
          "methods": ["PUT", "GET", "HEAD"],
          "headers": ["*"]
        },
        "exposeHeaders": ["ETag"],
        "maxAgeSeconds": 3600
      }
    ]
  }' | python3 -m json.tool

echo ""
echo "✅ CORS set. Users can now upload directly to R2 from the app."

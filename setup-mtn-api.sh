#!/bin/bash

# MTN MOMO API User Setup Script
# This script creates your API user and generates your API key

echo "🚀 Setting up MTN Mobile Money API..."
echo ""

# Your credentials
SUBSCRIPTION_KEY="88e6592aa57d425280a3e55be6ddcac6"
API_USER_UUID="70503a9f-fcb6-4e1f-971a-9ab515d80913"
BASE_URL="https://sandbox.momodeveloper.mtn.com"

echo "📋 Step 1: Creating API User..."
echo "UUID: $API_USER_UUID"
echo ""

# Create API User
CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/v1_0/apiuser" \
  -H "X-Reference-Id: $API_USER_UUID" \
  -H "Ocp-Apim-Subscription-Key: $SUBSCRIPTION_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "providerCallbackHost": "marriage-education.web.app"
  }')

HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "409" ]; then
    echo "✅ API User created successfully (or already exists)"
else
    echo "❌ Failed to create API User. HTTP Code: $HTTP_CODE"
    echo "Response: $CREATE_RESPONSE"
    exit 1
fi

echo ""
echo "⏳ Waiting 3 seconds for user to be registered..."
sleep 3

echo ""
echo "🔑 Step 2: Generating API Key..."
echo ""

# Generate API Key
APIKEY_RESPONSE=$(curl -s -X POST \
  "$BASE_URL/v1_0/apiuser/$API_USER_UUID/apikey" \
  -H "Ocp-Apim-Subscription-Key: $SUBSCRIPTION_KEY")

# Extract the API key
API_KEY=$(echo $APIKEY_RESPONSE | grep -o '"apiKey":"[^"]*"' | cut -d'"' -f4)

if [ -z "$API_KEY" ]; then
    echo "❌ Failed to generate API Key"
    echo "Response: $APIKEY_RESPONSE"
    exit 1
fi

echo "✅ API Key generated successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 SETUP COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Your MTN MOMO Credentials:"
echo ""
echo "Subscription Key: $SUBSCRIPTION_KEY"
echo "API User (UUID):  $API_USER_UUID"
echo "API Key:          $API_KEY"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✏️  Next: Update js/payment-config.js with:"
echo ""
echo "apiKey: '$API_KEY',"
echo "apiUser: '$API_USER_UUID',"
echo "subscriptionKey: '$SUBSCRIPTION_KEY',"
echo ""
echo "Then test with: open payment.html"
echo ""

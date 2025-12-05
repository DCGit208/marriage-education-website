#!/usr/bin/env ruby
# MTN MOMO API User Setup Script
require 'httparty'
require 'securerandom'
require 'json'

# Configuration
SUBSCRIPTION_KEY = '4455fd39957b48e281efde9612b55530' # Your Collections Primary Key
BASE_URL = 'https://sandbox.momodeveloper.mtn.com'
CALLBACK_HOST = 'marriageducation.com'

puts "🚀 MTN MOMO API User Setup"
puts "="*50

# Step 1: Generate API User UUID
api_user_uuid = SecureRandom.uuid
puts "\n📝 Step 1: Creating API User"
puts "Generated UUID: #{api_user_uuid}"

# Step 2: Create API User
puts "\n🔄 Sending request to create API user..."
response = HTTParty.post(
  "#{BASE_URL}/v1_0/apiuser",
  headers: {
    'X-Reference-Id' => api_user_uuid,
    'Ocp-Apim-Subscription-Key' => SUBSCRIPTION_KEY,
    'Content-Type' => 'application/json'
  },
  body: {
    providerCallbackHost: CALLBACK_HOST
  }.to_json
)

if response.code == 201
  puts "✅ API User created successfully!"
  puts "   API User UUID: #{api_user_uuid}"
else
  puts "❌ Failed to create API User"
  puts "   Status Code: #{response.code}"
  puts "   Response: #{response.body}"
  exit 1
end

# Step 3: Wait a moment for the user to be ready
puts "\n⏳ Waiting 3 seconds for user registration..."
sleep 3

# Step 4: Generate API Key
puts "\n🔄 Generating API Key..."
response = HTTParty.post(
  "#{BASE_URL}/v1_0/apiuser/#{api_user_uuid}/apikey",
  headers: {
    'Ocp-Apim-Subscription-Key' => SUBSCRIPTION_KEY
  }
)

if response.code == 201
  api_key = response['apiKey']
  puts "✅ API Key generated successfully!"
  puts "   API Key: #{api_key}"
else
  puts "❌ Failed to generate API Key"
  puts "   Status Code: #{response.code}"
  puts "   Response: #{response.body}"
  exit 1
end

# Step 5: Display Summary
puts "\n" + "="*50
puts "🎉 MTN MOMO API Setup Complete!"
puts "="*50
puts "\n📋 Your Credentials:"
puts "-"*50
puts "Subscription Key: #{SUBSCRIPTION_KEY}"
puts "API User:         #{api_user_uuid}"
puts "API Key:          #{api_key}"
puts "Environment:      sandbox"
puts "Base URL:         #{BASE_URL}"
puts "-"*50

puts "\n📝 Next Steps:"
puts "1. Copy these credentials to your .env file"
puts "2. Start the MOMO server: cd momo && bundle exec ruby server.rb"
puts "3. Test the payment flow"

puts "\n💾 Saving credentials to momo/.env file..."

env_content = <<~ENV
# MTN Mobile Money API Credentials
# Generated on #{Time.now}

# Primary Key (Collections)
MTN_MOMO_PRIMARY_KEY=#{SUBSCRIPTION_KEY}

# Subscription Key
MTN_MOMO_SUBSCRIPTION_KEY=#{SUBSCRIPTION_KEY}

# API User (UUID)
MTN_MOMO_API_USER=#{api_user_uuid}

# API Key
MTN_MOMO_API_KEY=#{api_key}

# Environment (sandbox or mtncameroon for production)
MTN_MOMO_ENVIRONMENT=sandbox

# API Base URL
MTN_MOMO_BASE_URL=#{BASE_URL}

# Your domain for callbacks
YOUR_DOMAIN=http://localhost:4243
ENV

File.write('momo/.env', env_content)
puts "✅ Credentials saved to momo/.env"

puts "\n✨ You're all set! Run 'cd momo && bundle exec ruby server.rb' to start testing."

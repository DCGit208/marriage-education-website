require 'stripe'
require 'dotenv/load'
Stripe.api_key = ENV['STRIPE_API_KEY']

begin
  products = Stripe::Product.list(limit: 1)
  puts "Stripe API connection successful! Product count: #{products.data.length}"
rescue => e
  puts "Stripe API error: #{e.message}"
end
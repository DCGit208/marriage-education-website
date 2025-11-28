#!/usr/bin/env ruby
# sync_stripe_products.rb
# Reads products.csv, creates/updates products & prices in Stripe, updates CSV with real Stripe IDs

require 'csv'
require 'stripe'
require 'dotenv/load' # Optional: loads .env for STRIPE_SECRET_KEY

CSV_PATH = './products.csv'
STRIPE_KEY = ENV['STRIPE_API_KEY'] || ENV['STRIPE_SECRET_KEY'] || 'sk_test_yourkeyhere'

Stripe.api_key = STRIPE_KEY

# Read products from CSV
products = []
headers = nil
CSV.foreach(CSV_PATH, headers: true) do |row|
  headers ||= row.headers
  products << row.to_h
end

# Helper to find or create Stripe product
# Returns [product_id, price_id]
def ensure_stripe_product(product)
  # Try to find by name (Stripe API does not support filtering by name directly)
  found = Stripe::Product.list(limit: 100, active: true).data.find { |p| p['name'] == product['name'] }
  if found
    stripe_product = found
  else
    stripe_product = Stripe::Product.create(
      name: product['name'],
      description: product['long_description'],
      metadata: { product_id: product['product_id'] }
    )
  end

  # Find or create price (in cents, USD)
  price_cents = (product['price'].to_f * 100).to_i
  found_price = Stripe::Price.list(product: stripe_product.id, active: true, limit: 100).data.find do |pr|
    pr.unit_amount == price_cents && pr.currency == 'usd'
  end
  if found_price
    stripe_price = found_price
  else
    stripe_price = Stripe::Price.create(
      product: stripe_product.id,
      unit_amount: price_cents,
      currency: 'usd',
    )
  end

  [stripe_product.id, stripe_price.id]
end

# Update products with real Stripe IDs
products.each_with_index do |prod, idx|
  puts "Syncing: #{prod['name']} ($#{prod['price']})..."
  begin
    real_pid, real_priceid = ensure_stripe_product(prod)
    prod['stripe_product_id'] = real_pid
    prod['stripe_price_id'] = real_priceid
    puts "  => Stripe product: #{real_pid}, price: #{real_priceid}"
  rescue => e
    puts "  ERROR: #{e.message}"
  end
end

# Write back to CSV (add stripe_price_id if not present)
unless headers.include?('stripe_price_id')
  headers << 'stripe_price_id'
end

CSV.open(CSV_PATH, 'w') do |csv|
  csv << headers
  products.each { |p| csv << headers.map { |h| p[h] } }
end

puts "Updated #{products.size} products with real Stripe IDs in #{CSV_PATH}"

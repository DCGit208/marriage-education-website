require 'sinatra'
require 'stripe'
require 'httparty'
require 'json'
require 'csv'
require 'securerandom'
require 'base64'

# Load dotenv only in development
if ENV['RACK_ENV'] != 'production' && File.exist?('.env')
  require 'dotenv/load'
end

# ============================================================================
# UNIFIED PAYMENT BACKEND - Stripe + MTN MOMO
# ============================================================================

# Debug: Print all environment variables at startup
puts "\n" + "=" * 80
puts "ENVIRONMENT VARIABLES DEBUG"
puts "=" * 80
puts "RACK_ENV: #{ENV['RACK_ENV'] || 'not set'}"
puts "PORT: #{ENV['PORT'] || 'not set'}"
puts "Raw ENV keys containing STRIPE: #{ENV.keys.select { |k| k.include?('STRIPE') }}"
puts "Raw ENV keys containing MOMO: #{ENV.keys.select { |k| k.include?('MOMO') }}"
puts "STRIPE_API_KEY present: #{ENV.key?('STRIPE_API_KEY')}"
puts "STRIPE_API_KEY value: #{ENV['STRIPE_API_KEY'] ? "#{ENV['STRIPE_API_KEY'][0..15]}..." : 'EMPTY OR NIL'}"
puts "=" * 80 + "\n"

# Stripe Configuration
STRIPE_API_KEY = ENV['STRIPE_API_KEY']
if STRIPE_API_KEY && !STRIPE_API_KEY.empty?
  Stripe.api_key = STRIPE_API_KEY
  puts "[CONFIG] ✅ Stripe API key loaded: #{STRIPE_API_KEY[0..15]}..."
else
  puts "[CONFIG] ❌ WARNING: STRIPE_API_KEY is not set or empty!"
end

# MTN MOMO Configuration
MTN_MOMO_PRIMARY_KEY = ENV['MTN_MOMO_PRIMARY_KEY'] || '4455fd39957b48e281efde9612b55530'
MTN_MOMO_SUBSCRIPTION_KEY = ENV['MTN_MOMO_SUBSCRIPTION_KEY'] || MTN_MOMO_PRIMARY_KEY
MTN_MOMO_API_USER = ENV['MTN_MOMO_API_USER'] || 'a26c84f3-d4b6-4d7d-b695-2a4a6078bed5'
MTN_MOMO_API_KEY = ENV['MTN_MOMO_API_KEY'] || 'ddf8f48d32cf4d5f90a1e401540ed143'
MTN_MOMO_ENVIRONMENT = ENV['MTN_MOMO_ENVIRONMENT'] || 'sandbox'
MTN_MOMO_BASE_URL = ENV['MTN_MOMO_BASE_URL'] || 'https://sandbox.momodeveloper.mtn.com'

# Domain Configuration
YOUR_DOMAIN = ENV['YOUR_DOMAIN'] || 'http://localhost:4567'

# Sinatra Configuration
set :static, true
set :bind, '0.0.0.0'
set :port, ENV['PORT'] || 4567
set :public_folder, File.join(File.dirname(__FILE__), 'public')

$stdout.sync = true
$stderr.sync = true

puts "=" * 80
puts "🚀 UNIFIED PAYMENT SERVER STARTING"
puts "=" * 80
puts "Port: #{settings.port}"
puts "Domain: #{YOUR_DOMAIN}"
puts "Public folder: #{settings.public_folder}"
puts "Stripe API Key: #{ENV['STRIPE_API_KEY'] ? "Configured (#{ENV['STRIPE_API_KEY'][0..10]}...)" : 'NOT SET - CHECK RENDER ENV VARS'}"
puts "Stripe.api_key: #{Stripe.api_key ? "Set (#{Stripe.api_key[0..10]}...)" : 'NOT SET'}"
puts "MOMO Primary Key: #{MTN_MOMO_PRIMARY_KEY ? MTN_MOMO_PRIMARY_KEY[0..10] + '...' : 'NOT SET'}"
puts "MOMO Subscription Key: #{MTN_MOMO_SUBSCRIPTION_KEY ? MTN_MOMO_SUBSCRIPTION_KEY[0..10] + '...' : 'NOT SET'}"
puts "MOMO API User: #{MTN_MOMO_API_USER || 'NOT SET'}"
puts "MOMO API Key: #{MTN_MOMO_API_KEY ? MTN_MOMO_API_KEY[0..10] + '...' : 'NOT SET'}"
puts "MOMO Environment: #{MTN_MOMO_ENVIRONMENT}"
puts "All ENV vars: #{ENV.keys.grep(/STRIPE|MOMO/).join(', ')}"
puts "=" * 80

# Enable CORS
before do
  headers['Access-Control-Allow-Origin'] = '*'
  headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  headers['Access-Control-Allow-Headers'] = 'Content-Type'
end

options '*' do
  200
end

# ============================================================================
# MTN MOMO TOKEN MANAGEMENT
# ============================================================================

$momo_token = nil
$momo_token_expiry = nil

def get_momo_token
  # Return cached token if still valid (with 5 minute buffer)
  if $momo_token && $momo_token_expiry && Time.now < ($momo_token_expiry - 300)
    puts "[MOMO] Using cached token"
    return $momo_token
  end

  puts "[MOMO] Requesting new OAuth2 token..."
  
  begin
    response = HTTParty.post(
      "#{MTN_MOMO_BASE_URL}/collection/token/",
      headers: {
        'Authorization' => "Basic #{Base64.strict_encode64("#{MTN_MOMO_API_USER}:#{MTN_MOMO_API_KEY}")}",
        'Ocp-Apim-Subscription-Key' => MTN_MOMO_SUBSCRIPTION_KEY
      }
    )

    if response.code == 200
      $momo_token = response['access_token']
      $momo_token_expiry = Time.now + response['expires_in'].to_i
      puts "[MOMO] ✅ Token obtained, expires at #{$momo_token_expiry}"
      return $momo_token
    else
      puts "[MOMO] ❌ Token request failed: #{response.code} - #{response.body}"
      return nil
    end
  rescue => e
    puts "[MOMO] ❌ Token request error: #{e.message}"
    return nil
  end
end

# ============================================================================
# STRIPE PAYMENT ENDPOINT
# ============================================================================

post '/create-checkout-session' do
  content_type 'application/json'

  begin
    request.body.rewind
    data = JSON.parse(request.body.read)
    product_id = data['product_id']
    puts "[STRIPE] Creating checkout session for product: #{product_id}"
  rescue JSON::ParserError => e
    puts "[STRIPE] ❌ Invalid JSON: #{e.message}"
    halt 400, { error: 'Invalid JSON in request body' }.to_json
  end

  # Load product database
  product_db = {}
  CSV.foreach(File.join(__dir__, 'stripe', 'products.csv'), headers: true) do |row|
    next if row['product_id'].to_s.strip.empty?
    product_db[row['product_id']] = row.to_h
  end

  dynamic_name = data['name']
  dynamic_price = data['price']
  dynamic_currency = (data['currency'] || 'USD').to_s.upcase

  # If dynamic pricing is provided, use it (for campaign products)
  if dynamic_name && dynamic_price
    # Dynamic campaign pricing
    currency_map = { 'FCFA' => 'XAF', 'XAF' => 'XAF', 'XOF' => 'XOF', 'USD' => 'USD' }
    currency = currency_map[dynamic_currency] || 'USD'
    zero_decimal = %w[BIF CLP DJF GNF JPY KMF KRW MGA PYG RWF UGX VND VUV XAF XOF XPF]
    amount = zero_decimal.include?(currency) ? dynamic_price.to_i : (dynamic_price.to_f * 100).to_i

    begin
      render_url = ENV['RENDER_EXTERNAL_URL'] || 'https://marriage-education-website.onrender.com'
      session = Stripe::Checkout::Session.create({
        line_items: [{
          price_data: {
            currency: currency.downcase,
            product_data: { name: dynamic_name },
            unit_amount: amount,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: render_url + '/success.html?session_id={CHECKOUT_SESSION_ID}&product_id=' + (product_id || 'dynamic') + '&payment_method=stripe',
        cancel_url: YOUR_DOMAIN + '/payment.html',
      })

      puts "[STRIPE] ✅ Dynamic checkout session created: #{session.id}"
      return { url: session.url }.to_json
    rescue Stripe::StripeError => e
      puts "[STRIPE] ❌ Error: #{e.message}"
      halt 500, { error: "Failed to create dynamic checkout session: #{e.message}" }.to_json
    end
  # Otherwise, use fixed price from products.csv
  elsif product_id && product_db[product_id]
    product = product_db[product_id]
    stripe_price_id = product['stripe_price_id']
    
    if stripe_price_id && !stripe_price_id.empty?
      idempotency_key = "checkout_#{product_id}_#{Time.now.to_i}_#{SecureRandom.hex(8)}"

      begin
        render_url = ENV['RENDER_EXTERNAL_URL'] || 'https://marriage-education-website.onrender.com'
        session = Stripe::Checkout::Session.create({
          line_items: [{ price: stripe_price_id, quantity: 1 }],
          mode: 'payment',
          success_url: render_url + '/success.html?session_id={CHECKOUT_SESSION_ID}&product_id=' + product_id + '&payment_method=stripe',
          cancel_url: YOUR_DOMAIN + '/payment.html?product=' + product_id,
          automatic_tax: {enabled: true},
        }, { idempotency_key: idempotency_key })

        puts "[STRIPE] ✅ Checkout session created: #{session.id}"
        return { url: session.url }.to_json
      rescue Stripe::StripeError => e
        puts "[STRIPE] ❌ Error: #{e.message}"
        halt 500, { error: "Failed to create checkout session: #{e.message}" }.to_json
      end
    else
      halt 400, { error: "Product #{product_id} has no Stripe price configured" }.to_json
    end
  else
    halt 400, { error: 'Invalid product_id or missing name/price for dynamic pricing' }.to_json
  end
end

# ============================================================================
# MTN MOMO PAYMENT ENDPOINT
# ============================================================================

post '/create-momo-payment' do
  content_type 'application/json'

  begin
    request.body.rewind
    data = JSON.parse(request.body.read)
    product_id = data['product_id']
    product_name = data['name']
    amount = data['price'].to_i
    currency_input = (data['currency'] || 'FCFA').upcase
    phone_number = data['phone_number']
    
    # Sanitize product name for MTN MOMO (WAF blocks certain words)
    # Replace "Sex By Design" with generic book title
    sanitized_name = product_name.to_s
      .gsub(/Sex By Design/i, 'SBD Book')
      .gsub(/sex/i, 'SBD')
      .gsub(/adult/i, 'mature')
    
    puts "[MOMO] Payment request - Product: #{product_id}, Amount: #{amount}, Phone: #{phone_number}"
    puts "[MOMO] Original name: #{product_name}"
    puts "[MOMO] Sanitized name: #{sanitized_name}"

    # Validate phone number
    if phone_number.nil? || phone_number.empty?
      halt 400, { error: 'Phone number is required' }.to_json
    end
    
    phone_number = phone_number.gsub(/[^0-9]/, '')
    phone_number = "237#{phone_number}" unless phone_number.start_with?('237')
    
    unless phone_number.match?(/^237[0-9]{9}$/)
      halt 400, { error: 'Invalid phone number format. Use 237XXXXXXXXX' }.to_json
    end

    # MTN MOMO sandbox requires EUR, production uses XAF
    is_production = MTN_MOMO_ENVIRONMENT == 'production'
    momo_currency = is_production ? 'XAF' : 'EUR'
    momo_amount = is_production ? amount : (amount.to_f / 655.957).round(2).to_i

    # Get OAuth token
    token = get_momo_token
    unless token
      halt 500, { error: 'Failed to obtain MOMO authentication token' }.to_json
    end

    # Create payment reference
    reference_id = SecureRandom.uuid

    # Request to Pay
    response = HTTParty.post(
      "#{MTN_MOMO_BASE_URL}/collection/v1_0/requesttopay",
      headers: {
        'Authorization' => "Bearer #{token}",
        'X-Reference-Id' => reference_id,
        'X-Target-Environment' => MTN_MOMO_ENVIRONMENT,
        'Ocp-Apim-Subscription-Key' => MTN_MOMO_SUBSCRIPTION_KEY,
        'Content-Type' => 'application/json'
      },
      body: {
        amount: momo_amount.to_s,
        currency: momo_currency,
        externalId: product_id || 'campaign',
        payer: { partyIdType: 'MSISDN', partyId: phone_number },
        payerMessage: "Book purchase - #{product_id}",
        payeeNote: "Order #{product_id}"
      }.to_json
    )

    if response.code == 202
      puts "[MOMO] ✅ Payment request created: #{reference_id}"
      return {
        success: true,
        reference_id: reference_id,
        amount: momo_amount,
        currency: momo_currency,
        phone_number: phone_number,
        product_name: product_name,
        message: 'Payment request sent. Please check your phone to approve.'
      }.to_json
    else
      puts "[MOMO] ❌ Payment request failed: #{response.code} - #{response.body}"
      halt 500, { error: "Failed to create payment: #{response.body}" }.to_json
    end

  rescue JSON::ParserError => e
    puts "[MOMO] ❌ Invalid JSON: #{e.message}"
    halt 400, { error: 'Invalid JSON in request body' }.to_json
  rescue => e
    puts "[MOMO] ❌ Unexpected error: #{e.message}"
    halt 500, { error: "Internal server error: #{e.message}" }.to_json
  end
end

# Check MOMO Payment Status
get '/momo-payment-status' do
  content_type 'application/json'
  
  reference_id = params['reference_id']
  unless reference_id
    halt 400, { error: 'Missing reference_id parameter' }.to_json
  end

  token = get_momo_token
  unless token
    halt 500, { error: 'Failed to obtain MOMO authentication token' }.to_json
  end

  begin
    response = HTTParty.get(
      "#{MTN_MOMO_BASE_URL}/collection/v1_0/requesttopay/#{reference_id}",
      headers: {
        'Authorization' => "Bearer #{token}",
        'X-Target-Environment' => MTN_MOMO_ENVIRONMENT,
        'Ocp-Apim-Subscription-Key' => MTN_MOMO_SUBSCRIPTION_KEY
      }
    )

    if response.code == 200
      payment_status = response['status']
      reason = response['reason']
      
      puts "[MOMO] Payment status for #{reference_id}: #{payment_status}"
      
      return {
        success: true,
        status: payment_status,
        reference_id: reference_id,
        reason: reason
      }.to_json
    else
      puts "[MOMO] ❌ Status check failed: #{response.code} - #{response.body}"
      halt 500, { error: 'Failed to check payment status', details: response.body }.to_json
    end
  rescue => e
    puts "[MOMO] ❌ Status check error: #{e.message}"
    halt 500, { error: "Internal server error: #{e.message}" }.to_json
  end
end

# ============================================================================
# DOWNLOAD ENDPOINT (Shared for all payments)
# ============================================================================

get '/download' do
  product_id = params['product_id']
  halt 400, 'Missing product_id' unless product_id

  puts "[DOWNLOAD] Request for product: #{product_id}"

  # Load product database
  product_db = {}
  CSV.foreach(File.join(__dir__, 'stripe', 'products.csv'), headers: true) do |row|
    next if row['product_id'].to_s.strip.empty?
    product_db[row['product_id']] = row.to_h
  end

  product = product_db[product_id]
  halt 404, 'Product not found' unless product
  
  download_filename = product['download_filename']
  halt 404, 'No download available for this product' unless download_filename && !download_filename.strip.empty?

  ebook_path = File.expand_path(File.join(__dir__, 'ebooks', download_filename))
  
  unless File.exist?(ebook_path)
    puts "[DOWNLOAD] ❌ File not found: #{ebook_path}"
    halt 404, 'eBook file not found'
  end

  puts "[DOWNLOAD] ✅ Serving: #{download_filename}"
  send_file ebook_path, filename: download_filename, type: 'application/pdf'
end

# ============================================================================
# HEALTH CHECK
# ============================================================================

get '/health' do
  content_type 'application/json'
  {
    status: 'ok',
    timestamp: Time.now.iso8601,
    environment: MTN_MOMO_ENVIRONMENT,
    stripe: (STRIPE_API_KEY && !STRIPE_API_KEY.empty?) ? 'configured' : 'not configured',
    stripe_set_in_gem: Stripe.api_key ? 'yes' : 'no',
    momo: MTN_MOMO_API_USER ? 'configured' : 'not configured'
  }.to_json
end

# Root endpoint
get '/' do
  redirect '/payment.html'
end

puts "✅ Server ready on port #{settings.port}"


require 'stripe'
require 'sinatra'
require 'csv'
require 'dotenv/load'
require 'securerandom'

# Load Stripe API key from environment
Stripe.api_key = ENV['STRIPE_API_KEY']

set :static, true
set :bind, '0.0.0.0'
set :port, ENV['PORT'] || 4242
set :public_folder, File.dirname(__FILE__) + '/public'

# Use environment variable for domain (production) or fallback to localhost
YOUR_DOMAIN = ENV['YOUR_DOMAIN'] || 'http://localhost:4242'

require 'json'

$stdout.sync = true
$stderr.sync = true

# Enable CORS for local development
before do
  headers['Access-Control-Allow-Origin'] = '*'
  headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  headers['Access-Control-Allow-Headers'] = 'Content-Type'
end

options '*' do
  200
end

post '/create-checkout-session' do
  content_type 'application/json'

  begin
    request.body.rewind
    raw_body = request.body.read
    puts "[DEBUG] Raw POST body: #{raw_body}"
    data = JSON.parse(raw_body)
    product_id = data['product_id']
    puts "[DEBUG] Parsed product_id: #{product_id}"
  rescue JSON::ParserError => e
    puts "[ERROR] Failed to parse JSON: #{e.message}"
    halt 400, { error: 'Invalid JSON in request body' }.to_json
  rescue => e
    puts "[ERROR] Unexpected error parsing request: #{e.message}"
    halt 500, { error: 'Internal server error' }.to_json
  end

  # Load product database from CSV (with headers)
  product_db = {}
  CSV.foreach(File.join(__dir__, 'products.csv'), headers: true) do |row|
    next if row['product_id'].to_s.strip.empty?
    product_db[row['product_id']] = row.to_h
  end

  # Dynamic campaign fallback: if product_id not found and name/price provided, create session via price_data
  dynamic_name = data['name']
  dynamic_price = data['price']
  dynamic_currency = (data['currency'] || 'USD').to_s.upcase

  if product_id && product_db[product_id]
    product = product_db[product_id]
    product_name = product['name']
    stripe_price_id = product['stripe_price_id']

    # Generate idempotency key to prevent duplicate charges on retries
    idempotency_key = "checkout_#{product_id}_#{Time.now.to_i}_#{SecureRandom.hex(8)}"

    begin
      session = Stripe::Checkout::Session.create({
        line_items: [{
          price: stripe_price_id,
          quantity: 1,
        }],
        mode: 'payment',
        success_url: YOUR_DOMAIN + '/return.html?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: YOUR_DOMAIN + '/checkout.html?product=' + product_id,
        automatic_tax: {enabled: true},
      }, {
        idempotency_key: idempotency_key
      })

      return({ url: session.url }.to_json)
    rescue Stripe::StripeError => e
      puts "[ERROR] Stripe API error: #{e.message}"
      halt 500, { error: "Failed to create checkout session: #{e.user_message || e.message}" }.to_json
    end
  elsif dynamic_name && dynamic_price
    currency_map = { 'FCFA' => 'XAF', 'XAF' => 'XAF', 'XOF' => 'XOF', 'USD' => 'USD' }
    currency = currency_map[dynamic_currency] || 'USD'
    zero_decimal = %w[BIF CLP DJF GNF JPY KMF KRW MGA PYG RWF UGX VND VUV XAF XOF XPF]
    begin
      amount = if zero_decimal.include?(currency)
        dynamic_price.to_s.gsub(/[^0-9]/, '').to_i
      else
        (dynamic_price.to_s.strip.to_f * 100).round
      end
    # Generate idempotency key for dynamic pricing
    idempotency_key = "checkout_dynamic_#{product_id || 'campaign'}_#{Time.now.to_i}_#{SecureRandom.hex(8)}"

    begin
      session = Stripe::Checkout::Session.create({
        line_items: [{
          price_data: {
            currency: currency.downcase,
            product_data: { name: dynamic_name },
            unit_amount: amount
          },
          quantity: 1
        }],
        mode: 'payment',
        success_url: YOUR_DOMAIN + '/return.html?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: YOUR_DOMAIN + '/checkout.html?product=' + (product_id || ''),
        automatic_tax: {enabled: true}
      }, {
        idempotency_key: idempotency_key
      })

      return({ url: session.url }.to_json)
    rescue Stripe::StripeError => e
      puts "[ERROR] Stripe API error: #{e.message}"
      halt 500, { error: "Failed to create checkout session: #{e.user_message || e.message}" }.to_json
    end
    }, {
      idempotency_key: idempotency_key
    })

    return({ url: session.url }.to_json)
  else
    halt 400, { error: 'Invalid product ID' }.to_json
  end

end

get '/download' do
  # Example: /download?product_id=the-sex-by-design-compendium
  product_id = params['product_id']
  halt 400, 'Missing product_id' unless product_id

  # Load product database from CSV (with headers)
  product_db = {}
  CSV.foreach(File.join(__dir__, 'products.csv'), headers: true) do |row|
    next if row['product_id'].to_s.strip.empty?
    product_db[row['product_id']] = row.to_h
  end

  product = product_db[product_id]
  halt 404, 'Product not found' unless product
  download_filename = product['download_filename']
  halt 404, 'No download available for this product' unless download_filename && !download_filename.strip.empty?

  ebook_path = File.expand_path(File.join(__dir__, '../ebooks', download_filename))
  halt 404, 'eBook file not found' unless File.exist?(ebook_path)

  send_file ebook_path, :filename => download_filename, :type => 'application/pdf'
end

# Webhook endpoint for Stripe events (recommended for fulfillment)
post '/webhooks' do
  payload = request.body.read
  sig_header = request.env['HTTP_STRIPE_SIGNATURE']
  endpoint_secret = ENV['STRIPE_WEBHOOK_SECRET']

  begin
    event = Stripe::Webhook.construct_event(
      payload, sig_header, endpoint_secret
    )
  rescue JSON::ParserError => e
    puts "[WEBHOOK ERROR] Invalid payload: #{e.message}"
    halt 400
  rescue Stripe::SignatureVerificationError => e
    puts "[WEBHOOK ERROR] Invalid signature: #{e.message}"
    halt 400
  end

  # Handle the event
  case event['type']
  when 'checkout.session.completed'
    session = event['data']['object']
    puts "[WEBHOOK] ✅ Payment succeeded for session: #{session['id']}"
    puts "[WEBHOOK] Customer email: #{session['customer_details']['email']}"
    
    # TODO: Fulfill the order here (send download link, update database, etc.)
    # Example: send_download_email(session)
    
  when 'payment_intent.succeeded'
    payment_intent = event['data']['object']
    puts "[WEBHOOK] ✅ PaymentIntent succeeded: #{payment_intent['id']}"
    
  when 'payment_intent.payment_failed'
    payment_intent = event['data']['object']
    puts "[WEBHOOK] ❌ Payment failed: #{payment_intent['id']}"
    
  else
    puts "[WEBHOOK] Unhandled event type: #{event['type']}"
  end

  # Return 200 immediately to acknowledge receipt
  status 200
end

get '/session-status' do
  session = Stripe::Checkout::Session.retrieve(params[:session_id])

  # Find the product_id by matching the price_id in products.csv
  price_id = nil
  if session.line_items && session.line_items.data[0]
    price_id = session.line_items.data[0].price.id
  else
    # Fallback: fetch line items
    line_items = Stripe::Checkout::Session.list_line_items(params[:session_id], limit: 1)
    price_id = line_items.data[0].price.id if line_items.data[0]
  end

  product_id = nil
  if price_id
    CSV.foreach(File.join(__dir__, 'products.csv'), headers: true) do |row|
      if row['stripe_price_id'] == price_id
        product_id = row['product_id']
        break
      end
    end
  end

  {
    status: session.status,
    customer_email: session.customer_details.email,
    product_id: product_id
  }.to_json
end
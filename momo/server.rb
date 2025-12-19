require 'sinatra'
require 'httparty'
require 'json'
require 'csv'
require 'dotenv/load'
require 'securerandom'

# MTN MOMO Configuration
MTN_MOMO_PRIMARY_KEY = ENV['MTN_MOMO_PRIMARY_KEY'] || '4455fd39957b48e281efde9612b55530'
MTN_MOMO_SUBSCRIPTION_KEY = ENV['MTN_MOMO_SUBSCRIPTION_KEY']
MTN_MOMO_API_USER = ENV['MTN_MOMO_API_USER']
MTN_MOMO_API_KEY = ENV['MTN_MOMO_API_KEY']
MTN_MOMO_ENVIRONMENT = ENV['MTN_MOMO_ENVIRONMENT'] || 'sandbox'
MTN_MOMO_BASE_URL = ENV['MTN_MOMO_BASE_URL'] || 'https://sandbox.momodeveloper.mtn.com'
YOUR_DOMAIN = ENV['YOUR_DOMAIN'] || 'http://localhost:4243'

set :static, true
set :bind, '0.0.0.0'
set :port, ENV['PORT'] || 4243
set :public_folder, File.dirname(__FILE__) + '/public'

$stdout.sync = true
$stderr.sync = true

# Enable CORS
before do
  headers['Access-Control-Allow-Origin'] = '*'
  headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  headers['Access-Control-Allow-Headers'] = 'Content-Type'
end

options '*' do
  200
end

# Token cache
$momo_token = nil
$momo_token_expiry = nil

# Get OAuth2 Bearer Token
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

# Create MOMO Payment Request
post '/create-momo-payment' do
  content_type 'application/json'

  begin
    request.body.rewind
    data = JSON.parse(request.body.read)
    product_id = data['product_id']
    phone_number = data['phone_number']
    
    puts "[MOMO] Payment request - Product: #{product_id}, Phone: #{phone_number}"

    # Validate phone number (Cameroon format: 237XXXXXXXXX or XXXXXXXXX)
    if phone_number.nil? || phone_number.empty?
      halt 400, { error: 'Phone number is required' }.to_json
    end
    
    # Normalize phone number
    phone_number = phone_number.gsub(/[^0-9]/, '')
    phone_number = "237#{phone_number}" unless phone_number.start_with?('237')
    
    unless phone_number.match?(/^237[0-9]{9}$/)
      halt 400, { error: 'Invalid phone number format. Use 237XXXXXXXXX' }.to_json
    end

  rescue JSON::ParserError => e
    puts "[MOMO] ❌ Invalid JSON: #{e.message}"
    halt 400, { error: 'Invalid JSON in request body' }.to_json
  end

  # Load product database
  product_db = {}
  CSV.foreach(File.join(__dir__, '../stripe/products.csv'), headers: true) do |row|
    next if row['product_id'].to_s.strip.empty?
    product_db[row['product_id']] = row.to_h
  end

  # Get product details or use dynamic pricing
  dynamic_name = data['name']
  dynamic_price = data['price']
  dynamic_currency = (data['currency'] || 'XAF').to_s.upcase
  
  # Normalize currency code (FCFA -> XAF)
  dynamic_currency = 'XAF' if dynamic_currency == 'FCFA'

  if product_id && product_db[product_id]
    product = product_db[product_id]
    product_name = product['name']
    # Convert USD to XAF if needed (1 USD = 600 XAF)
    price_str = product['price']
    amount = (price_str.to_f * 600).to_i # Convert to FCFA
  elsif dynamic_name && dynamic_price
    product_name = dynamic_name
    # Map currency
    if dynamic_currency == 'XAF'
      amount = dynamic_price.to_s.gsub(/[^0-9]/, '').to_i
    elsif dynamic_currency == 'USD'
      amount = (dynamic_price.to_f * 600).to_i # Convert USD to XAF
    else
      # Invalid currency
      halt 400, { error: "Currency not supported. Please use XAF or FCFA." }.to_json
    end
  else
    halt 400, { error: 'Invalid product ID or missing product details' }.to_json
  end
  
  puts "[MOMO] Product: #{product_name}, Amount: #{amount} XAF"

  # Validate amount
  if amount <= 0 || amount < 100
    halt 400, { error: 'Minimum payment amount is 100 FCFA' }.to_json
  end

  # Get OAuth token
  token = get_momo_token
  unless token
    halt 500, { error: 'Failed to authenticate with MTN MOMO. Please try again.' }.to_json
  end

  # Generate unique reference ID
  reference_id = SecureRandom.uuid
  external_id = "ME_#{product_id || 'campaign'}_#{Time.now.to_i}"

  puts "[MOMO] Creating payment request - Amount: #{amount} XAF, Reference: #{reference_id}"

  # Create Request to Pay
  begin
    # Use EUR for sandbox, XAF for production (MTN sandbox requirement)
    api_currency = MTN_MOMO_ENVIRONMENT == 'sandbox' ? 'EUR' : 'XAF'
    
    request_body = {
      amount: amount.to_s,
      currency: api_currency,
      externalId: external_id,
      payer: {
        partyIdType: 'MSISDN',
        partyId: phone_number
      },
      payerMessage: "Payment for #{product_name}",
      payeeNote: "Marriage Education - #{product_name}"
    }
    
    puts "[MOMO] Request body: #{request_body.to_json}"
    
    response = HTTParty.post(
      "#{MTN_MOMO_BASE_URL}/collection/v1_0/requesttopay",
      headers: {
        'Authorization' => "Bearer #{token}",
        'X-Reference-Id' => reference_id,
        'X-Target-Environment' => MTN_MOMO_ENVIRONMENT,
        'Ocp-Apim-Subscription-Key' => MTN_MOMO_SUBSCRIPTION_KEY,
        'Content-Type' => 'application/json'
      },
      body: request_body.to_json
    )

    puts "[MOMO] Response code: #{response.code}"
    puts "[MOMO] Response body: #{response.body}" unless response.code == 202

    if response.code == 202
      puts "[MOMO] ✅ Payment request created successfully"
      
      # Save to pending payments for admin approval
      save_pending_payment({
        reference: reference_id,
        external_id: external_id,
        product_id: product_id,
        product_name: product_name,
        amount: amount,
        currency: api_currency,
        phone: phone_number,
        email: data['email'] || 'no-email@example.com',
        status: 'pending',
        created_at: Time.now.iso8601
      })
      
      # Send Telegram notification to admin
      send_admin_telegram_notification(reference_id, product_name, amount, api_currency, phone_number)
      
      return {
        success: true,
        reference_id: reference_id,
        amount: amount,
        currency: api_currency,
        phone_number: phone_number,
        product_name: product_name,
        message: 'Payment request sent. Please check your phone to approve.'
      }.to_json
    else
      puts "[MOMO] ❌ Payment request failed: #{response.code} - #{response.body}"
      error_message = "Failed to create payment request."
      
      # Parse error response
      if response.body && !response.body.empty?
        begin
          error_data = JSON.parse(response.body)
          error_message += " #{error_data['message'] || error_data['error'] || 'Please try again.'}"
        rescue
          error_message += " Please try again."
        end
      end
      
      halt 500, { error: error_message }.to_json
    end
  rescue => e
    puts "[MOMO] ❌ Payment request error: #{e.message}"
    puts "[MOMO] Error backtrace: #{e.backtrace.first(3).join("\n")}"
    halt 500, { error: "Payment request failed: #{e.message}" }.to_json
  end
end

# Check MOMO Payment Status
get '/momo-payment-status' do
  content_type 'application/json'
  
  reference_id = params['reference_id']
  
  unless reference_id
    halt 400, { error: 'Missing reference_id parameter' }.to_json
  end

  puts "[MOMO] Checking payment status for: #{reference_id}"

  # Get OAuth token
  token = get_momo_token
  unless token
    halt 500, { error: 'Authentication failed' }.to_json
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
      status = response['status']
      puts "[MOMO] Payment status: #{status}"
      
      return {
        success: true,
        status: status,
        amount: response['amount'],
        currency: response['currency'],
        financial_transaction_id: response['financialTransactionId'],
        external_id: response['externalId'],
        payer: response['payer'],
        reason: response['reason']
      }.to_json
    else
      puts "[MOMO] ❌ Status check failed: #{response.code} - #{response.body}"
      halt 500, { error: 'Failed to check payment status' }.to_json
    end
  rescue => e
    puts "[MOMO] ❌ Status check error: #{e.message}"
    halt 500, { error: "Status check failed: #{e.message}" }.to_json
  end
end

# Webhook endpoint for MOMO callbacks (if supported)
post '/momo-webhook' do
  payload = request.body.read
  puts "[MOMO WEBHOOK] Received callback: #{payload}"

  begin
    data = JSON.parse(payload)
    reference_id = data['referenceId']
    status = data['status']
    
    puts "[MOMO WEBHOOK] Reference: #{reference_id}, Status: #{status}"
    
    # TODO: Implement order fulfillment based on status
    # if status == 'SUCCESSFUL'
    #   fulfill_order(reference_id)
    # end
    
    status 200
  rescue => e
    puts "[MOMO WEBHOOK] ❌ Error processing webhook: #{e.message}"
    status 400
  end
end

# Download endpoint (shared with Stripe)
get '/download' do
  product_id = params['product_id']
  halt 400, 'Missing product_id' unless product_id

  # Load product database
  product_db = {}
  CSV.foreach(File.join(__dir__, '../stripe/products.csv'), headers: true) do |row|
    next if row['product_id'].to_s.strip.empty?
    product_db[row['product_id']] = row.to_h
  end

  product = product_db[product_id]
  halt 404, 'Product not found' unless product
  download_filename = product['download_filename']
  halt 404, 'No download available for this product' unless download_filename && !download_filename.strip.empty?

  ebook_path = File.expand_path(File.join(__dir__, '../ebooks', download_filename))
  halt 404, 'eBook file not found' unless File.exist?(ebook_path)

  send_file ebook_path, filename: download_filename, type: 'application/pdf'
end

# Health check
get '/health' do
  content_type 'application/json'
  {
    status: 'ok',
    service: 'MTN MOMO Payment Gateway',
    environment: MTN_MOMO_ENVIRONMENT,
    timestamp: Time.now.iso8601
  }.to_json
end

puts "[MOMO] 🚀 MTN Mobile Money server starting on port #{settings.port}..."
puts "[MOMO] Environment: #{MTN_MOMO_ENVIRONMENT}"
puts "[MOMO] Base URL: #{MTN_MOMO_BASE_URL}"
puts "[MOMO] Ready to accept payment requests!"

# ============================================================================
# PENDING PAYMENTS MANAGEMENT (Admin Approval System)
# ============================================================================

PENDING_PAYMENTS_FILE = File.join(File.dirname(__FILE__), '../pending_payments.json')

# Telegram Configuration
TELEGRAM_BOT_TOKEN = ENV['TELEGRAM_BOT_TOKEN']
TELEGRAM_CHAT_ID = ENV['TELEGRAM_CHAT_ID']
TELEGRAM_ENABLED = !TELEGRAM_BOT_TOKEN.nil? && !TELEGRAM_BOT_TOKEN.empty?

if TELEGRAM_ENABLED
  puts "[TELEGRAM] ✅ Enabled - Admin notifications will be sent to Chat ID: #{TELEGRAM_CHAT_ID}"
else
  puts "[TELEGRAM] ⚠️  Disabled - Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable admin notifications"
end

# Initialize pending_payments.json if it doesn't exist
unless File.exist?(PENDING_PAYMENTS_FILE)
  File.write(PENDING_PAYMENTS_FILE, JSON.pretty_generate({ payments: [] }))
  puts "[ADMIN] Created pending_payments.json"
end

# Save payment to pending_payments.json
def save_pending_payment(payment_data)
  begin
    data = JSON.parse(File.read(PENDING_PAYMENTS_FILE))
    data['payments'] ||= []
    data['payments'] << payment_data
    File.write(PENDING_PAYMENTS_FILE, JSON.pretty_generate(data))
    puts "[ADMIN] Saved pending payment: #{payment_data[:reference]}"
    true
  rescue => e
    puts "[ADMIN] ❌ Error saving payment: #{e.message}"
    false
  end
end

# Send Telegram notification to admin
def send_admin_telegram_notification(reference, product_name, amount, currency, phone)
  return unless TELEGRAM_ENABLED
  
  puts "[TELEGRAM] 📱 Sending admin notification..."
  
  begin
    message = <<~MSG
🔔 *New Payment Pending Approval*

Reference: `#{reference}`
Product: *#{product_name}*
Amount: #{amount} #{currency}
Phone: #{phone}

👉 [Review & Approve](https://marriageducation.com/admin-payments.html)
    MSG
    
    url = "https://api.telegram.org/bot#{TELEGRAM_BOT_TOKEN}/sendMessage"
    
    response = HTTParty.post(url,
      body: {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      }
    )
    
    if response.success?
      puts "[TELEGRAM] ✅ Admin notification sent"
      true
    else
      puts "[TELEGRAM] ❌ Failed: #{response.code} - #{response.body}"
      false
    end
  rescue => e
    puts "[TELEGRAM] ❌ Error: #{e.message}"
    false
  end
end

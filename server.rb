require 'sinatra'
require 'stripe'
require 'httparty'
require 'json'
require 'csv'
require 'securerandom'
require 'base64'
require 'time'
require 'mail'

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
# MANUAL MOMO PAYMENT TRACKING
# ============================================================================

PENDING_PAYMENTS_FILE = File.join(File.dirname(__FILE__), 'pending_payments.json')
DOWNLOAD_TOKENS_FILE = File.join(File.dirname(__FILE__), 'download_tokens.json')

# Email Configuration (iPage SMTP)
SMTP_HOST = ENV['SMTP_HOST'] || 'smtp.yourdomain.com'
SMTP_PORT = ENV['SMTP_PORT'] || '587'
SMTP_USERNAME = ENV['SMTP_USERNAME']
SMTP_PASSWORD = ENV['SMTP_PASSWORD']
FROM_EMAIL = ENV['FROM_EMAIL'] || 'noreply@marriageducation.com'

# Configure Mail gem for SMTP
if SMTP_USERNAME && SMTP_PASSWORD
  Mail.defaults do
    delivery_method :smtp, {
      address: SMTP_HOST,
      port: SMTP_PORT.to_i,
      domain: 'marriageducation.com',
      user_name: SMTP_USERNAME,
      password: SMTP_PASSWORD,
      authentication: 'plain',
      enable_starttls_auto: true
    }
  end
  puts "[EMAIL] ✅ SMTP configured: #{SMTP_HOST}:#{SMTP_PORT} as #{SMTP_USERNAME}"
else
  puts "[EMAIL] ⚠️  SMTP not configured - emails will not be sent"
end

# Initialize files if they don't exist
unless File.exist?(PENDING_PAYMENTS_FILE)
  File.write(PENDING_PAYMENTS_FILE, JSON.pretty_generate({ payments: [] }))
end

unless File.exist?(DOWNLOAD_TOKENS_FILE)
  File.write(DOWNLOAD_TOKENS_FILE, JSON.pretty_generate({ tokens: [] }))
end

# Helper: Read pending payments
def read_pending_payments
  JSON.parse(File.read(PENDING_PAYMENTS_FILE))
rescue => e
  puts "[ERROR] Failed to read pending payments: #{e.message}"
  { 'payments' => [] }
end

# Helper: Write pending payments
def write_pending_payments(data)
  File.write(PENDING_PAYMENTS_FILE, JSON.pretty_generate(data))
rescue => e
  puts "[ERROR] Failed to write pending payments: #{e.message}"
  false
end

# Helper: Read download tokens
def read_download_tokens
  JSON.parse(File.read(DOWNLOAD_TOKENS_FILE))
rescue => e
  puts "[ERROR] Failed to read download tokens: #{e.message}"
  { 'tokens' => [] }
end

# Helper: Write download tokens
def write_download_tokens(data)
  File.write(DOWNLOAD_TOKENS_FILE, JSON.pretty_generate(data))
rescue => e
  puts "[ERROR] Failed to write download tokens: #{e.message}"
  false
end

# Helper: Generate secure download token
def generate_download_token(payment)
  token = SecureRandom.urlsafe_base64(32)
  expiry = Time.now + (7 * 24 * 60 * 60) # 7 days from now
  
  {
    'token' => token,
    'product_id' => payment['product_id'],
    'product_name' => payment['product_name'],
    'email' => payment['email'],
    'reference' => payment['reference'],
    'created_at' => Time.now.iso8601,
    'expires_at' => expiry.iso8601,
    'download_count' => 0,
    'max_downloads' => 5,
    'status' => 'active'
  }
end

# Helper: Send email via SMTP (iPage)
def send_email(to_email, subject, html_content)
  return false unless SMTP_USERNAME && SMTP_PASSWORD
  
  begin
    mail = Mail.new do
      from     "Marriage Education <#{FROM_EMAIL}>"
      to       to_email
      subject  subject
      
      html_part do
        content_type 'text/html; charset=UTF-8'
        body html_content
      end
    end
    
    mail.deliver!
    puts "[EMAIL] ✅ Sent to #{to_email} via SMTP"
    true
  rescue => e
    puts "[EMAIL] ❌ Error: #{e.message}"
    puts "[EMAIL] ❌ Backtrace: #{e.backtrace.first(3).join(' | ')}"
    false
  end
end

# Helper: Generate download email HTML
def generate_download_email(product_name, download_url, expiry_date)
  <<~HTML
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #FFCB05; color: #000; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #000; color: #FFCB05 !important; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        .info-box { background: #fff; padding: 15px; border-left: 4px solid #FFCB05; margin: 20px 0; }
        .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Your Purchase is Confirmed!</h1>
        </div>
        <div class="content">
          <p>Thank you for your purchase of <strong>#{product_name}</strong>!</p>
          
          <p>Your payment has been verified and approved. Click the button below to download your eBook:</p>
          
          <div style="text-align: center;">
            <a href="#{download_url}" class="button">📥 Download Your eBook</a>
          </div>
          
          <div class="info-box">
            <strong>⏰ Important Information:</strong><br>
            • This link expires on: <strong>#{expiry_date}</strong><br>
            • Maximum 5 downloads allowed<br>
            • Save the file to your device for unlimited access<br>
          </div>
          
          <p>If you have any issues downloading, please contact us at support@marriageducation.com</p>
          
          <p>Enjoy your reading!</p>
          
          <p><strong>Marriage Education Team</strong></p>
        </div>
        <div class="footer">
          <p>This email was sent because you purchased an eBook from Marriage Education.<br>
          If you did not make this purchase, please contact us immediately.</p>
        </div>
      </div>
    </body>
    </html>
  HTML
end

# Submit manual payment
post '/submit-manual-payment' do
  content_type 'application/json'
  
  begin
    request.body.rewind
    data = JSON.parse(request.body.read)
    
    payment = {
      'reference' => data['reference'],
      'product_id' => data['product_id'],
      'product_name' => data['product_name'],
      'amount' => data['amount'],
      'currency' => data['currency'],
      'phone' => data['phone'],
      'email' => data['email'],
      'timestamp' => data['timestamp'],
      'status' => 'pending',
      'created_at' => Time.now.iso8601
    }
    
    payments_data = read_pending_payments
    payments_data['payments'] << payment
    
    if write_pending_payments(payments_data)
      puts "[MANUAL PAYMENT] New payment submitted: #{payment['reference']} - #{payment['amount']} FCFA"
      { success: true, message: 'Payment submitted successfully' }.to_json
    else
      halt 500, { error: 'Failed to save payment' }.to_json
    end
  rescue => e
    puts "[ERROR] Submit manual payment: #{e.message}"
    halt 500, { error: e.message }.to_json
  end
end

# Get pending payments (for admin)
get '/admin/pending-payments' do
  content_type 'application/json'
  
  # Simple auth check - you can enhance this
  auth_token = request.env['HTTP_AUTHORIZATION']
  unless auth_token == 'Bearer admin-secret-2024' # Change this!
    halt 401, { error: 'Unauthorized' }.to_json
  end
  
  payments_data = read_pending_payments
  payments_data.to_json
end

# Approve payment and send download link
post '/admin/approve-payment' do
  content_type 'application/json'
  
  # Simple auth check
  auth_token = request.env['HTTP_AUTHORIZATION']
  unless auth_token == 'Bearer admin-secret-2024' # Change this!
    halt 401, { error: 'Unauthorized' }.to_json
  end
  
  begin
    request.body.rewind
    data = JSON.parse(request.body.read)
    reference = data['reference']
    
    payments_data = read_pending_payments
    payment = payments_data['payments'].find { |p| p['reference'] == reference }
    
    if payment
      payment['status'] = 'approved'
      payment['approved_at'] = Time.now.iso8601
      
      if write_pending_payments(payments_data)
        puts "[ADMIN] Payment approved: #{reference}"
        
        # Generate secure download token
        token_data = generate_download_token(payment)
        tokens = read_download_tokens
        tokens['tokens'] << token_data
        write_download_tokens(tokens)
        
        # Build download URL with token
        render_url = ENV['YOUR_DOMAIN'] || 'https://marriageducation.com'
        download_url = "#{render_url}/download?token=#{token_data['token']}"
        
        # Send email automatically
        expiry_date = Time.parse(token_data['expires_at']).strftime('%B %d, %Y at %I:%M %p')
        email_html = generate_download_email(payment['product_name'], download_url, expiry_date)
        email_sent = send_email(payment['email'], '📥 Your eBook is Ready to Download', email_html)
        
        {
          success: true,
          message: 'Payment approved',
          download_url: download_url,
          email: payment['email'],
          email_sent: email_sent,
          token: token_data['token'],
          expires_at: token_data['expires_at']
        }.to_json
      else
        halt 500, { error: 'Failed to update payment' }.to_json
      end
    else
      halt 404, { error: 'Payment not found' }.to_json
    end
  rescue => e
    puts "[ERROR] Approve payment: #{e.message}"
    halt 500, { error: e.message }.to_json
  end
end

# Reject payment
post '/admin/reject-payment' do
  content_type 'application/json'
  
  auth_token = request.env['HTTP_AUTHORIZATION']
  unless auth_token == 'Bearer admin-secret-2024'
    halt 401, { error: 'Unauthorized' }.to_json
  end
  
  begin
    request.body.rewind
    data = JSON.parse(request.body.read)
    reference = data['reference']
    reason = data['reason'] || 'Payment not verified'
    
    payments_data = read_pending_payments
    payment = payments_data['payments'].find { |p| p['reference'] == reference }
    
    if payment
      payment['status'] = 'rejected'
      payment['rejected_at'] = Time.now.iso8601
      payment['rejection_reason'] = reason
      
      if write_pending_payments(payments_data)
        puts "[ADMIN] Payment rejected: #{reference} - #{reason}"
        { success: true, message: 'Payment rejected' }.to_json
      else
        halt 500, { error: 'Failed to update payment' }.to_json
      end
    else
      halt 404, { error: 'Payment not found' }.to_json
    end
  rescue => e
    puts "[ERROR] Reject payment: #{e.message}"
    halt 500, { error: e.message }.to_json
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
  token = params['token']
  
  # Legacy support for old links (will be removed later)
  if !token && params['product_id']
    product_id = params['product_id']
    puts "[DOWNLOAD] ⚠️  Legacy download request for product: #{product_id}"
    
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

    puts "[DOWNLOAD] ✅ Serving (legacy): #{download_filename}"
    return send_file ebook_path, filename: download_filename, type: 'application/pdf'
  end
  
  # New secure token-based download
  halt 400, 'Missing download token' unless token
  
  puts "[DOWNLOAD] Token request: #{token[0..8]}..."
  
  # Find token
  tokens_data = read_download_tokens
  token_record = tokens_data['tokens'].find { |t| t['token'] == token }
  
  halt 404, 'Invalid or expired download link' unless token_record
  
  # Check if token is active
  halt 403, 'Download link has been deactivated' unless token_record['status'] == 'active'
  
  # Check expiry
  expiry_time = Time.parse(token_record['expires_at'])
  if Time.now > expiry_time
    token_record['status'] = 'expired'
    write_download_tokens(tokens_data)
    halt 403, 'Download link has expired. Please contact support.'
  end
  
  # Check download limit
  if token_record['download_count'] >= token_record['max_downloads']
    halt 403, 'Download limit reached. You have already downloaded this file 5 times.'
  end
  
  # Load product database
  product_db = {}
  CSV.foreach(File.join(__dir__, 'stripe', 'products.csv'), headers: true) do |row|
    next if row['product_id'].to_s.strip.empty?
    product_db[row['product_id']] = row.to_h
  end

  product = product_db[token_record['product_id']]
  halt 404, 'Product not found' unless product
  
  download_filename = product['download_filename']
  halt 404, 'No download available for this product' unless download_filename && !download_filename.strip.empty?

  ebook_path = File.expand_path(File.join(__dir__, 'ebooks', download_filename))
  
  unless File.exist?(ebook_path)
    puts "[DOWNLOAD] ❌ File not found: #{ebook_path}"
    halt 404, 'eBook file not found'
  end
  
  # Increment download count
  token_record['download_count'] += 1
  token_record['last_downloaded_at'] = Time.now.iso8601
  write_download_tokens(tokens_data)
  
  puts "[DOWNLOAD] ✅ Serving: #{download_filename} (Download #{token_record['download_count']}/#{token_record['max_downloads']})"
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


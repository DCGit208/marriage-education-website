require 'sinatra'
require 'stripe'
require 'httparty'
require 'json'
require 'csv'
require 'securerandom'
require 'base64'
require 'time'
require 'mail'
require 'digest'

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

# ============================================================================
# SECURITY & RATE LIMITING
# ============================================================================

# In-memory rate limiting store (consider Redis for production)
$rate_limit_store = {}
$failed_attempts = []
SECURITY_LOG_FILE = File.join(File.dirname(__FILE__), 'security_log.json')

# Helper: Log security events
def log_security_event(event_type, details = {})
  event = {
    timestamp: Time.now.iso8601,
    type: event_type,
    ip: request.ip,
    user_agent: request.user_agent,
    path: request.path_info,
    method: request.request_method,
    details: details
  }
  
  $failed_attempts << event
  
  # Keep only last 1000 events in memory
  $failed_attempts = $failed_attempts.last(1000) if $failed_attempts.length > 1000
  
  # Also write to file
  begin
    existing_logs = File.exist?(SECURITY_LOG_FILE) ? JSON.parse(File.read(SECURITY_LOG_FILE)) : []
    existing_logs << event
    existing_logs = existing_logs.last(5000) # Keep last 5000 in file
    File.write(SECURITY_LOG_FILE, JSON.pretty_generate(existing_logs))
  rescue => e
    puts "[SECURITY] Failed to write security log: #{e.message}"
  end
  
  puts "[SECURITY] #{event_type.upcase}: #{details.inspect} from #{request.ip}"
end

# Helper: Check rate limit
def check_rate_limit(key, max_requests = 10, window_seconds = 60)
  now = Time.now.to_i
  $rate_limit_store[key] ||= []
  
  # Remove old requests outside the time window
  $rate_limit_store[key].reject! { |timestamp| now - timestamp > window_seconds }
  
  if $rate_limit_store[key].length >= max_requests
    log_security_event('rate_limit_exceeded', { key: key, limit: max_requests, window: window_seconds })
    halt 429, { error: 'Too many requests. Please try again later.' }.to_json
  end
  
  $rate_limit_store[key] << now
end

# ============================================================================
# SESSION MANAGEMENT FOR ADMIN
# ============================================================================

# In-memory session store (consider Redis for production)
$admin_sessions = {}
ADMIN_PASSWORD = ENV['ADMIN_PASSWORD'] || 'admin-secret-2024'
SESSION_EXPIRY = 24 * 60 * 60 # 24 hours

# Helper: Validate admin session
def validate_admin_session
  # Check both Authorization header (for API calls) and session cookie
  auth_header = request.env['HTTP_AUTHORIZATION']
  
  # Support old Bearer token for backwards compatibility
  if auth_header == "Bearer #{ADMIN_PASSWORD}"
    return true
  end
  
  # Check for session token
  if auth_header&.start_with?('Bearer ')
    session_token = auth_header.sub('Bearer ', '')
    session_data = $admin_sessions[session_token]
    
    if session_data && Time.now.to_i < session_data[:expires_at]
      # Extend session on activity
      session_data[:expires_at] = Time.now.to_i + SESSION_EXPIRY
      return true
    else
      # Session expired or invalid
      $admin_sessions.delete(session_token)
      log_security_event('expired_session_access', { session: session_token[0..8] + '...' })
    end
  end
  
  log_security_event('unauthorized_admin_access', { path: request.path_info })
  halt 401, { error: 'Unauthorized - Please login' }.to_json
end

# Enable CORS for admin panel
before do
  headers 'Access-Control-Allow-Origin' => '*'
  headers 'Access-Control-Allow-Methods' => 'GET, POST, PUT, DELETE, OPTIONS'
  headers 'Access-Control-Allow-Headers' => 'Content-Type, Authorization'
  headers 'Access-Control-Max-Age' => '86400'
  
  # Security headers
  headers 'X-Content-Type-Options' => 'nosniff'
  headers 'X-Frame-Options' => 'SAMEORIGIN'
  headers 'X-XSS-Protection' => '1; mode=block'
  headers 'Strict-Transport-Security' => 'max-age=31536000; includeSubDomains' if request.secure?
  
  # Handle preflight OPTIONS requests
  if request.request_method == 'OPTIONS'
    halt 200
  end
end

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
# ADMIN AUTHENTICATION ENDPOINTS
# ============================================================================

# Admin login endpoint
post '/admin/login' do
  content_type 'application/json'
  
  # Rate limit: 5 login attempts per IP per 15 minutes
  check_rate_limit("admin_login_#{request.ip}", 5, 900)
  
  begin
    request.body.rewind
    data = JSON.parse(request.body.read)
    password = data['password']
    
    if password == ADMIN_PASSWORD
      # Generate secure session token
      session_token = SecureRandom.urlsafe_base64(32)
      
      $admin_sessions[session_token] = {
        created_at: Time.now.to_i,
        expires_at: Time.now.to_i + SESSION_EXPIRY,
        ip: request.ip,
        user_agent: request.user_agent
      }
      
      puts "[ADMIN] Successful login from #{request.ip}"
      
      {
        success: true,
        token: session_token,
        expires_in: SESSION_EXPIRY,
        message: 'Login successful'
      }.to_json
    else
      log_security_event('failed_admin_login', { ip: request.ip })
      halt 401, { error: 'Invalid password' }.to_json
    end
  rescue => e
    puts "[ERROR] Admin login: #{e.message}"
    halt 500, { error: 'Internal server error' }.to_json
  end
end

# Admin logout endpoint
post '/admin/logout' do
  content_type 'application/json'
  
  auth_header = request.env['HTTP_AUTHORIZATION']
  if auth_header&.start_with?('Bearer ')
    session_token = auth_header.sub('Bearer ', '')
    $admin_sessions.delete(session_token)
    puts "[ADMIN] Logout: session #{session_token[0..8]}..."
  end
  
  { success: true, message: 'Logged out successfully' }.to_json
end

# Admin session check endpoint
get '/admin/session' do
  content_type 'application/json'
  
  validate_admin_session
  
  {
    success: true,
    message: 'Session valid'
  }.to_json
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

# Telegram Configuration (FREE - for admin notifications)
TELEGRAM_ENABLED = ENV['TELEGRAM_BOT_TOKEN'] && ENV['TELEGRAM_CHAT_ID']
TELEGRAM_BOT_TOKEN = ENV['TELEGRAM_BOT_TOKEN']
TELEGRAM_CHAT_ID = ENV['TELEGRAM_CHAT_ID']

if TELEGRAM_ENABLED
  puts "[TELEGRAM] ✅ Enabled - Admin notifications + customer download links active"
else
  puts "[TELEGRAM] ⚠️  Disabled - Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable"
end

# WhatsApp Configuration (FREE - CallMeBot API for customer download links - OPTIONAL)
WHATSAPP_ENABLED = ENV['CALLMEBOT_API_KEY'] && !ENV['CALLMEBOT_API_KEY'].empty?
CALLMEBOT_API_KEY = ENV['CALLMEBOT_API_KEY']

if WHATSAPP_ENABLED
  puts "[WHATSAPP] ✅ Enabled - Customer WhatsApp download links active"
else
  puts "[WHATSAPP] ⚠️  Disabled - Using Telegram for customer links (CallMeBot optional)"
end

# Configure Mail gem for SMTP
if SMTP_USERNAME && SMTP_PASSWORD
  # Port 465 requires SSL/TLS, port 587 uses STARTTLS
  use_ssl = SMTP_PORT.to_i == 465
  use_starttls = SMTP_PORT.to_i == 587
  
  Mail.defaults do
    delivery_method :smtp, {
      address: SMTP_HOST,
      port: SMTP_PORT.to_i,
      domain: 'marriageducation.com',
      user_name: SMTP_USERNAME,
      password: SMTP_PASSWORD,
      authentication: 'login',  # Changed from 'plain' to 'login' for iPage
      enable_starttls_auto: use_starttls,
      ssl: use_ssl,
      tls: use_ssl,
      openssl_verify_mode: 'none'  # Disable SSL verification for compatibility
    }
  end
  puts "[EMAIL] ✅ SMTP configured: #{SMTP_HOST}:#{SMTP_PORT} as #{SMTP_USERNAME} (SSL: #{use_ssl}, STARTTLS: #{use_starttls})"
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

# Helper: Send admin notification email
def send_admin_notification(payment)
  return unless SMTP_USERNAME && SMTP_PASSWORD
  
  admin_email = FROM_EMAIL # Send to admin email
  subject = "🔔 New Payment Pending Approval - #{payment['reference']}"
  
  html_content = <<~HTML
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa; }
        .header { background: #FF6B6B; color: #fff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #fff; padding: 20px; border-radius: 0 0 8px 8px; }
        .info { background: #f8f9fa; padding: 15px; border-left: 4px solid #FF6B6B; margin: 15px 0; }
        .button { display: inline-block; background: #FF6B6B; color: #fff !important; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>🔔 New Payment Awaiting Approval</h2>
        </div>
        <div class="content">
          <p><strong>A new manual MOMO payment has been submitted and requires your approval.</strong></p>
          
          <div class="info">
            <strong>Payment Details:</strong><br>
            Reference: <strong>#{payment['reference']}</strong><br>
            Product: <strong>#{payment['product_name']}</strong><br>
            Amount: <strong>#{payment['amount']} #{payment['currency']}</strong><br>
            Customer Email: <strong>#{payment['email']}</strong><br>
            Phone: <strong>#{payment['phone']}</strong><br>
            Submitted: <strong>#{payment['created_at']}</strong>
          </div>
          
          <p style="text-align: center;">
            <a href="https://marriageducation.com/public/admin-dashboard.html" class="button">
              👉 Review & Approve Payment
            </a>
          </p>
          
          <p style="color: #666; font-size: 14px;">
            Login to your admin panel to verify the payment and approve or reject it.
          </p>
        </div>
      </div>
    </body>
    </html>
  HTML
  
  send_email(admin_email, subject, html_content)
  
  # Send Telegram notification to admin
  if TELEGRAM_ENABLED
    telegram_msg = <<~MSG
🔔 *New Payment Pending Approval*

Reference: `#{payment['reference']}`
Product: *#{payment['product_name']}*
Amount: #{payment['amount']} #{payment['currency']}
Customer: #{payment['email']}
Phone: #{payment['phone']}

👉 [Review & Approve](https://marriageducation.com/admin-payments.html)
    MSG
    send_telegram(telegram_msg)
  end
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
    puts "[EMAIL] 📤 Attempting to send email to: #{to_email}"
    puts "[EMAIL] 📤 From: #{FROM_EMAIL}"
    puts "[EMAIL] 📤 Subject: #{subject}"
    
    # Generate plain text version from HTML
    text_content = html_content
      .gsub(/<style>.*?<\/style>/m, '')
      .gsub(/<[^>]+>/, ' ')
      .gsub(/\s+/, ' ')
      .strip
    
    mail = Mail.new do
      from     "Marriage Education <#{FROM_EMAIL}>"
      to       to_email
      subject  subject
      reply_to FROM_EMAIL
      
      text_part do
        content_type 'text/plain; charset=UTF-8'
        body text_content
      end
      
      html_part do
        content_type 'text/html; charset=UTF-8'
        body html_content
      end
    end
    
    # Get the delivery response
    response = mail.deliver!
    puts "[EMAIL] ✅ SMTP Response: #{response.inspect}"
    puts "[EMAIL] ✅ Successfully sent to #{to_email}"
    true
  rescue Net::SMTPAuthenticationError => e
    puts "[EMAIL] ❌ SMTP Authentication Failed: #{e.message}"
    puts "[EMAIL] ❌ Check username/password for #{SMTP_USERNAME}"
    false
  rescue Net::SMTPServerBusy => e
    puts "[EMAIL] ❌ SMTP Server Busy: #{e.message}"
    false
  rescue Net::SMTPFatalError => e
    puts "[EMAIL] ❌ SMTP Fatal Error: #{e.message}"
    puts "[EMAIL] ❌ This usually means the email was rejected by the server"
    false
  rescue => e
    puts "[EMAIL] ❌ General Error: #{e.class.name} - #{e.message}"
    puts "[EMAIL] ❌ Backtrace: #{e.backtrace.first(5).join("\n")}"
    false
  end
end

# Helper: Send Telegram message (FREE - for admin notifications)
def send_telegram(message)
  return false unless TELEGRAM_ENABLED
  
  puts "[TELEGRAM] 📱 Sending notification..."
  
  begin
    url = "https://api.telegram.org/bot#{TELEGRAM_BOT_TOKEN}/sendMessage"
    
    response = HTTParty.post(url,
      body: {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      }
    )
    
    if response.success?
      puts "[TELEGRAM] ✅ Message sent successfully"
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

# Helper: Send Telegram message to customer (via username or chat_id)
def send_customer_telegram(username_or_id, message)
  return false unless TELEGRAM_ENABLED
  
  # If it's a username (starts with @), we need to get their chat_id first
  # For now, send to admin with customer contact info
  # In production, customer would start bot first to get their chat_id
  
  puts "[TELEGRAM] 📱 Sending to customer: #{username_or_id}"
  
  # For simplicity, send to admin with customer info and download link
  admin_msg = <<~MSG
📤 *Forward to Customer*

Customer: #{username_or_id}

#{message}

_Note: Customer needs to start @sbd_bot first to receive direct messages_
  MSG
  
  send_telegram(admin_msg)
end

# Helper: Send WhatsApp to customer (FREE - CallMeBot)
def send_customer_whatsapp(phone, message)
  return false unless WHATSAPP_ENABLED && phone && !phone.to_s.empty?
  
  # Clean phone number - remove +, spaces, dashes
  clean_phone = phone.to_s.strip.gsub(/[^0-9]/, '')
  
  puts "[WHATSAPP] 📱 Sending to customer: +#{clean_phone}"
  
  begin
    # CallMeBot WhatsApp API - FREE
    url = "https://api.callmebot.com/whatsapp.php"
    
    response = HTTParty.get(url,
      query: {
        phone: clean_phone,
        text: message,
        apikey: CALLMEBOT_API_KEY
      }
    )
    
    if response.success? && response.body.include?('success')
      puts "[WHATSAPP] ✅ Message sent to customer successfully"
      true
    else
      puts "[WHATSAPP] ❌ Failed: #{response.code} - #{response.body}"
      false
    end
  rescue => e
    puts "[WHATSAPP] ❌ Error: #{e.message}"
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
# ============================================================================
# AMBASSADOR COMMISSION TRACKING
# ============================================================================

AMBASSADOR_SALES_FILE = File.join(File.dirname(__FILE__), 'ambassador_sales.json')
REGIONAL_DIRECTORS_FILE = File.join(File.dirname(__FILE__), 'regional_directors.json')
REFERRAL_CODES_FILE = File.join(File.dirname(__FILE__), 'referral_codes.json')

# Helper: Read ambassador sales data
def read_ambassador_sales
  return { 'ambassadors' => {} } unless File.exist?(AMBASSADOR_SALES_FILE)
  JSON.parse(File.read(AMBASSADOR_SALES_FILE))
rescue => e
  puts "[ERROR] Failed to read ambassador sales: #{e.message}"
  { 'ambassadors' => {} }
end

# Helper: Write ambassador sales data
def write_ambassador_sales(data)
  File.write(AMBASSADOR_SALES_FILE, JSON.pretty_generate(data))
  true
rescue => e
  puts "[ERROR] Failed to write ambassador sales: #{e.message}"
  false
end

# Helper: Read regional directors data
def read_regional_directors
  return { 'directors' => {} } unless File.exist?(REGIONAL_DIRECTORS_FILE)
  JSON.parse(File.read(REGIONAL_DIRECTORS_FILE))
rescue => e
  puts "[ERROR] Failed to read regional directors: #{e.message}"
  { 'directors' => {} }
end

# Helper: Write regional directors data  
def write_regional_directors(data)
  File.write(REGIONAL_DIRECTORS_FILE, JSON.pretty_generate(data))
  true
rescue => e
  puts "[ERROR] Failed to write regional directors: #{e.message}"
  false
end

# Helper: Read referral codes data
def read_referral_codes
  return { 'referrals' => {} } unless File.exist?(REFERRAL_CODES_FILE)
  JSON.parse(File.read(REFERRAL_CODES_FILE))
rescue => e
  puts "[ERROR] Failed to read referral codes: #{e.message}"
  { 'referrals' => {} }
end

# Helper: Write referral codes data
def write_referral_codes(data)
  File.write(REFERRAL_CODES_FILE, JSON.pretty_generate(data))
  true
rescue => e
  puts "[ERROR] Failed to write referral codes: #{e.message}"
  false
end

# Helper: Track override commission for Regional Director
def track_rd_override(rd_code, ambassador_code, sale_amount, books_count, reference)
  rd_data = read_regional_directors
  
  return unless rd_data['directors'][rd_code]
  
  rd = rd_data['directors'][rd_code]
  
  # Calculate 10% override commission
  override_commission = sale_amount * 0.10
  
  # Update RD totals
  rd['override_commission'] ||= 0
  rd['override_commission'] += override_commission
  rd['team_books_sold'] ||= 0
  rd['team_books_sold'] += books_count
  rd['downline_count'] ||= 0  # Will be updated when ambassadors register
  
  # Update tier based on downline count
  downline = rd['downline_count'] || 0
  rd['tier'] = if downline >= 501
    'Diamond RD'
  elsif downline >= 301
    'Platinum RD'
  elsif downline >= 151
    'Gold RD'
  elsif downline >= 51
    'Silver RD'
  elsif downline >= 10
    'Bronze RD'
  else
    'Pending'
  end
  
  # Track override history
  rd['override_history'] ||= []
  rd['override_history'] << {
    'reference' => reference,
    'ambassador_code' => ambassador_code,
    'sale_amount' => sale_amount,
    'books_count' => books_count,
    'override' => override_commission,
    'date' => Time.now.iso8601
  }
  
  # Check for milestone bonuses
  check_rd_milestones(rd)
  
  write_regional_directors(rd_data)
  
  puts "[RD OVERRIDE] #{rd_code} earned #{override_commission} FCFA override from #{ambassador_code}"
  
  rd
end

# Helper: Check and award RD milestone bonuses
def check_rd_milestones(rd)
  downline = rd['downline_count'] || 0
  rd['milestones_reached'] ||= []
  
  milestones = [
    { count: 10, bonus: 100000, name: 'First 10 Ambassadors' },
    { count: 50, bonus: 500000, name: 'First 50 Ambassadors' },
    { count: 100, bonus: 2000000, name: 'First 100 Ambassadors' },
    { count: 500, bonus: 10000000, name: 'First 500 Ambassadors' }
  ]
  
  milestones.each do |milestone|
    if downline >= milestone[:count] && !rd['milestones_reached'].include?(milestone[:name])
      rd['override_commission'] ||= 0
      rd['override_commission'] += milestone[:bonus]
      rd['milestones_reached'] << milestone[:name]
      puts "[MILESTONE] 🎉 #{rd['code']} reached #{milestone[:name]} - #{milestone[:bonus]} FCFA bonus!"
    end
  end
end

# Helper: Track referral sale (Book Sharer Rewards)
def track_referral_sale(referral_code, amount)
  return unless referral_code && !referral_code.empty?
  
  referral_data = read_referral_codes
  
  return unless referral_data['referrals'][referral_code]
  
  referral = referral_data['referrals'][referral_code]
  referral['sales_count'] ||= 0
  referral['sales_count'] += 1
  referral['total_revenue'] ||= 0
  referral['total_revenue'] += amount.to_f
  referral['last_sale_date'] = Time.now.iso8601
  
  # Check for milestone (every 10 sales = 10,000 FCFA)
  previous_milestones = (referral['sales_count'] - 1) / 10
  current_milestones = referral['sales_count'] / 10
  
  if current_milestones > previous_milestones
    # New milestone reached!
    referral['commission_earned'] ||= 0
    referral['commission_pending'] ||= 0
    referral['commission_pending'] += 10000
    referral['commission_earned'] += 10000
    referral['milestones_reached'] ||= []
    referral['milestones_reached'] << current_milestones * 10
    
    puts "[REFERRAL MILESTONE] 🎉 #{referral_code} reached #{current_milestones * 10} sales - 10,000 FCFA earned!"
    
    # Send notifications
    send_referral_milestone_email(referral, current_milestones * 10)
  end
  
  write_referral_codes(referral_data)
  puts "[REFERRAL SALE] #{referral_code} - Sale count: #{referral['sales_count']}"
  
  referral
end

# Helper: Send referral milestone email (Book Sharer Rewards)
def send_referral_milestone_email(referral, milestone_sales)
  # Email to referrer
  referrer_subject = "🎉 You Earned 10,000 FCFA! #{milestone_sales} Sales Milestone Reached"
  referrer_body = <<-HTML
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .milestone { font-size: 48px; font-weight: bold; color: #10b981; text-align: center; margin: 20px 0; }
        .amount { font-size: 36px; font-weight: bold; color: #059669; text-align: center; margin: 20px 0; }
        .stats { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .stat-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
        .stat-label { color: #6b7280; }
        .stat-value { font-weight: bold; color: #1f2937; }
        .next-milestone { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; margin-top: 30px; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Milestone Achieved!</h1>
          <p>Your Book Sharing is Paying Off</p>
        </div>
        <div class="content">
          <div class="milestone">#{milestone_sales} Sales</div>
          <div class="amount">+10,000 FCFA Earned</div>
          
          <div class="stats">
            <div class="stat-row">
              <span class="stat-label">Referral Code:</span>
              <span class="stat-value">#{referral['code']}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Total Sales:</span>
              <span class="stat-value">#{referral['sales_count']}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Total Earned:</span>
              <span class="stat-value">#{referral['commission_earned']} FCFA</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Pending Payment:</span>
              <span class="stat-value">#{referral['commission_pending']} FCFA</span>
            </div>
          </div>
          
          <div class="next-milestone">
            <strong>💡 Next Milestone:</strong> Just #{10 - (referral['sales_count'] % 10)} more sales to earn another 10,000 FCFA!
          </div>
          
          <p><strong>What happens next?</strong></p>
          <ol>
            <li>Our admin team has been notified of your achievement</li>
            <li>They will verify and approve your commission within 1-2 business days</li>
            <li>Payment will be sent to your registered phone number via Mobile Money</li>
          </ol>
          
          <p><strong>Keep sharing!</strong> Every 10 sales = 10,000 FCFA. There's no limit to how much you can earn.</p>
          
          <div class="footer">
            <p>Marriage Education<br>
            Email: orders@marriageducation.com<br>
            Questions? Reply to this email.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  HTML
  
  send_email(referral['email'], referrer_subject, referrer_body)
  
  # Email to admin
  admin_subject = "🎁 Referral Milestone: #{referral['code']} - 10,000 FCFA Commission Pending"
  admin_body = <<-HTML
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; padding: 20px; text-align: center; }
        .content { background: #f9fafb; padding: 20px; }
        .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
        .stats { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .stat-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>📊 Book Sharer Milestone Reached</h2>
        </div>
        <div class="content">
          <div class="alert">
            <strong>⚠️ Action Required:</strong> Approve and release 10,000 FCFA commission payment
          </div>
          
          <div class="stats">
            <div class="stat-row">
              <span><strong>Referral Code:</strong></span>
              <span>#{referral['code']}</span>
            </div>
            <div class="stat-row">
              <span><strong>Email:</strong></span>
              <span>#{referral['email']}</span>
            </div>
            <div class="stat-row">
              <span><strong>Milestone:</strong></span>
              <span>#{milestone_sales} sales</span>
            </div>
            <div class="stat-row">
              <span><strong>Commission Due:</strong></span>
              <span style="color: #10b981; font-weight: bold;">10,000 FCFA</span>
            </div>
            <div class="stat-row">
              <span><strong>Total Sales:</strong></span>
              <span>#{referral['sales_count']}</span>
            </div>
            <div class="stat-row">
              <span><strong>Total Earned:</strong></span>
              <span>#{referral['commission_earned']} FCFA</span>
            </div>
            <div class="stat-row">
              <span><strong>Pending Payment:</strong></span>
              <span>#{referral['commission_pending']} FCFA</span>
            </div>
          </div>
          
          <p><strong>Next Steps:</strong></p>
          <ol>
            <li>Verify the milestone achievement in the admin panel</li>
            <li>Process Mobile Money payment of 10,000 FCFA</li>
            <li>Mark commission as paid in the system</li>
          </ol>
          
          <p><em>The referrer has been notified and is awaiting payment confirmation.</em></p>
        </div>
      </div>
    </body>
    </html>
  HTML
  
  send_email('orders@marriageducation.com', admin_subject, admin_body)
  
  puts "[EMAIL] Referral milestone notifications sent for #{referral['code']}"
  true
rescue => e
  puts "[ERROR] Failed to send referral milestone email: #{e.message}"
  false
end

# Helper: Track a sale for an ambassador (with RD override)
def track_ambassador_sale(ambassador_code, amount, reference, recruited_by = nil)
  sales_data = read_ambassador_sales
  
  # Initialize ambassador record if doesn't exist
  sales_data['ambassadors'][ambassador_code] ||= {
    'code' => ambassador_code,
    'recruited_by' => recruited_by,
    'total_sales' => 0,
    'total_commission' => 0,
    'books_sold' => 0,
    'sales' => [],
    'level' => 'Starter'
  }
  
  ambassador = sales_data['ambassadors'][ambassador_code]
  
  # Calculate commission based on tier
  books_sold = ambassador['books_sold']
  commission_rate = if books_sold < 20
    1500  # Bronze: 1,500 FCFA per book
  elsif books_sold < 40
    1800  # Silver: 1,800 FCFA per book
  elsif books_sold < 60
    2000  # Gold: 2,000 FCFA per book
  else
    2500  # Super Seller: 2,500 FCFA per book
  end
  
  # Book price is 15,000 FCFA, so 1 book per sale
  books_from_sale = (amount / 15000.0).ceil
  commission = commission_rate * books_from_sale
  
  # Update totals
  ambassador['books_sold'] += books_from_sale
  ambassador['total_sales'] += amount
  ambassador['total_commission'] += commission
  
  # Update level
  ambassador['level'] = if ambassador['books_sold'] >= 90
    'Elite'
  elsif ambassador['books_sold'] >= 60
    'Super Seller'
  elsif ambassador['books_sold'] >= 40
    'Gold'
  elsif ambassador['books_sold'] >= 20
    'Silver'
  else
    'Bronze'
  end
  
  # Add sale record
  ambassador['sales'] << {
    'reference' => reference,
    'amount' => amount,
    'books' => books_from_sale,
    'commission' => commission,
    'date' => Time.now.iso8601
  }
  
  # Add completion bonus if exactly hit 60 books
  if ambassador['books_sold'] >= 60 && !ambassador['completion_bonus_paid']
    ambassador['total_commission'] += 10000
    ambassador['completion_bonus_paid'] = true
    puts "[BONUS] 🎉 #{ambassador_code} earned 10,000 FCFA completion bonus!"
  end
  
  write_ambassador_sales(sales_data)
  
  puts "[COMMISSION] #{ambassador_code}: #{books_from_sale} books, #{commission} FCFA commission, Level: #{ambassador['level']}"
  
  # Track RD override if ambassador was recruited by an RD
  if ambassador['recruited_by'] && ambassador['recruited_by'].start_with?('RD-')
    track_rd_override(ambassador['recruited_by'], ambassador_code, amount, books_from_sale, reference)
  end
  
  ambassador
end

# ============================================================================
# ROUTES
# ============================================================================

# Register new referral code (Book Sharer Rewards)
post '/register-referral-code' do
  content_type 'application/json'
  
  begin
    request.body.rewind
    data = JSON.parse(request.body.read)
    
    email = data['email']
    
    unless email && email.match?(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
      return { success: false, error: 'Valid email address required' }.to_json
    end
    
    referral_data = read_referral_codes
    
    # Check if email already has a referral code
    existing = referral_data['referrals'].values.find { |r| r['email'] == email }
    if existing
      return {
        success: true,
        code: existing['code'],
        existing: true,
        message: 'Welcome back! Here is your existing referral code.'
      }.to_json
    end
    
    # Generate unique referral code from email
    # Format: First 4 letters of email + random 3 digits
    email_prefix = email.split('@').first.gsub(/[^a-zA-Z]/, '').upcase[0..3] || 'USER'
    code = "#{email_prefix}#{rand(100..999)}"
    
    # Ensure uniqueness
    while referral_data['referrals'][code]
      code = "#{email_prefix}#{rand(100..999)}"
    end
    
    # Create referral record
    referral_data['referrals'][code] = {
      'code' => code,
      'email' => email,
      'sales_count' => 0,
      'total_revenue' => 0,
      'commission_earned' => 0,
      'commission_pending' => 0,
      'commission_paid' => 0,
      'milestones_reached' => [],
      'created_at' => Time.now.iso8601,
      'last_sale_date' => nil
    }
    
    write_referral_codes(referral_data)
    
    puts "[REFERRAL CODE] Created: #{code} for #{email}"
    
    {
      success: true,
      code: code,
      message: 'Referral code created successfully! Share your link and start earning.'
    }.to_json
    
  rescue JSON::ParserError => e
    status 400
    { success: false, error: 'Invalid JSON' }.to_json
  rescue => e
    puts "[ERROR] /register-referral-code: #{e.message}"
    status 500
    { success: false, error: 'Server error' }.to_json
  end
end

# Get ambassador leaderboard
get '/api/ambassador-leaderboard' do
  content_type 'application/json'
  
  sales_data = read_ambassador_sales
  
  leaderboard = sales_data['ambassadors'].values.sort_by { |a| -a['books_sold'] }.take(100)
  
  {
    success: true,
    leaderboard: leaderboard.map.with_index do |ambassador, index|
      {
        rank: index + 1,
        code: ambassador['code'],
        books_sold: ambassador['books_sold'],
        total_commission: ambassador['total_commission'],
        level: ambassador['level']
      }
    end,
    updated_at: Time.now.iso8601
  }.to_json
end

# Get individual ambassador stats
get '/api/ambassador-stats/:code' do
  content_type 'application/json'
  
  ambassador_code = params[:code].upcase
  sales_data = read_ambassador_sales
  
  ambassador = sales_data['ambassadors'][ambassador_code]
  
  if ambassador
    {
      success: true,
      ambassador: ambassador
    }.to_json
  else
    status 404
    { success: false, error: 'Ambassador not found' }.to_json
  end
end

# ============================================================================
# REGIONAL DIRECTOR API ENDPOINTS
# ============================================================================

# Get RD leaderboard
get '/api/rd-leaderboard' do
  content_type 'application/json'
  
  rd_data = read_regional_directors
  
  leaderboard = rd_data['directors'].values.sort_by { |rd| -(rd['team_books_sold'] || 0) }.take(100)
  
  {
    success: true,
    leaderboard: leaderboard.map.with_index do |rd, index|
      {
        rank: index + 1,
        code: rd['code'],
        name: rd['name'],
        downline_count: rd['downline_count'] || 0,
        team_books_sold: rd['team_books_sold'] || 0,
        override_commission: rd['override_commission'] || 0,
        tier: rd['tier'] || 'Pending'
      }
    end,
    updated_at: Time.now.iso8601
  }.to_json
end

# Get individual RD stats
get '/api/rd-stats/:code' do
  content_type 'application/json'
  
  rd_code = params[:code].upcase
  rd_data = read_regional_directors
  
  rd = rd_data['directors'][rd_code]
  
  if rd
    {
      success: true,
      rd: rd
    }.to_json
  else
    status 404
    { success: false, error: 'Regional Director not found' }.to_json
  end
end

# Get RD team (all ambassadors recruited by this RD)
get '/api/rd-team/:code' do
  content_type 'application/json'
  
  rd_code = params[:code].upcase
  sales_data = read_ambassador_sales
  
  # Filter ambassadors recruited by this RD
  team = sales_data['ambassadors'].values.select { |amb| amb['recruited_by'] == rd_code }
  
  {
    success: true,
    team: team,
    count: team.length
  }.to_json
end

# Register new Regional Director
post '/register-regional-director' do
  content_type 'application/json'
  
  begin
    request.body.rewind
    data = JSON.parse(request.body.read)
    
    rd_code = data['code']
    registration_fee = data['registrationFee'] || 50000
    
    # Store RD data temporarily in pending_payments.json with metadata
    # Actual RD record will be created upon payment approval
    rd_metadata = {
      'code' => rd_code,
      'firstName' => data['firstName'],
      'lastName' => data['lastName'],
      'email' => data['email'],
      'phone' => data['phone'],
      'city' => data['city'],
      'region' => data['region'],
      'is_ambassador' => data['isAmbassador'],
      'existing_amb_code' => data['existingAmbCode'],
      'leadership_experience' => data['leadershipExperience'],
      'network_size' => data['networkSize'],
      'recruitment_target' => data['recruitmentTarget'],
      'motivation' => data['motivation'],
      'payment_method' => data['paymentMethod'],
      'application_date' => Time.now.iso8601
    }
    
    # Create pending payment record
    payment = {
      'reference' => rd_code,
      'product_id' => 'rd-registration',
      'product_name' => "Regional Director Registration - #{data['firstName']} #{data['lastName']}",
      'amount' => registration_fee.to_s,
      'currency' => 'XAF',
      'phone' => data['phone'],
      'email' => data['email'],
      'ambassador_ref' => '',
      'rd_code' => rd_code,
      'rd_metadata' => rd_metadata,
      'timestamp' => Time.now.iso8601,
      'status' => 'pending',
      'created_at' => Time.now.iso8601
    }
    
    payments_data = read_pending_payments
    payments_data['payments'] << payment
    
    if write_pending_payments(payments_data)
      # Send notification email to admin
      send_rd_application_email(rd_metadata, registration_fee)
      
      puts "[RD REGISTRATION] ✅ #{rd_code} - #{data['firstName']} #{data['lastName']} - Payment pending"
      
      {
        success: true,
        message: 'Regional Director application submitted successfully',
        code: rd_code
      }.to_json
    else
      halt 500, { success: false, error: 'Failed to save application' }.to_json
    end
    
  rescue => e
    puts "[RD REGISTRATION ERROR] #{e.message}"
    status 500
    { success: false, error: e.message }.to_json
  end
end

# Helper: Send RD application notification email (to admin)
def send_rd_application_email(rd, registration_fee)
  begin
    full_name = "#{rd['firstName']} #{rd['lastName']}"
    subject = "New Regional Director Application - #{rd['code']}"
    body = <<~EMAIL
      New Regional Director Application Received
      
      Code: #{rd['code']}
      Name: #{full_name}
      Email: #{rd['email']}
      Phone: #{rd['phone']}
      Region: #{rd['region']}
      
      Recruitment Target: #{rd['recruitment_target']}
      Network Size: #{rd['network_size']}
      Registration Fee: #{registration_fee} FCFA
      Payment Method: #{rd['payment_method']}
      Status: Pending Payment
      
      Please review and send payment instructions to: #{rd['email']}
    EMAIL
    
    send_email(FROM_EMAIL, subject, body)
    puts "[RD APPLICATION EMAIL] Sent notification to admin"
  rescue => e
    puts "[RD APPLICATION EMAIL ERROR] #{e.message}"
  end
end

# Helper: Send RD credentials email (to new RD after payment approval)
def send_rd_credentials_email(rd_code, name, email)
  begin
    dashboard_url = "https://marriageducation.com/regional-director/dashboard.html"
    login_url = "https://marriageducation.com/rd-login.html"
    recruitment_url = "https://marriageducation.com/ambassador-register.html?rd=#{rd_code}"
    
    subject = "👑 Welcome to Regional Director Program - Your Login Credentials"
    
    html_content = <<~HTML
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa; }
          .header { background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%); color: #fff; padding: 30px; text-align: center; border-radius: 12px 12px 0 0; }
          .header .logo { font-size: 64px; margin-bottom: 10px; }
          .content { background: #fff; padding: 30px; border-radius: 0 0 12px 12px; }
          .credentials-box { background: #f3e8ff; padding: 25px; border-left: 4px solid #9333ea; margin: 20px 0; border-radius: 8px; }
          .rd-code { font-size: 32px; font-weight: 700; color: #7c3aed; font-family: 'Courier New', monospace; letter-spacing: 2px; margin: 10px 0; }
          .button { display: inline-block; background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%); color: #fff !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 15px 10px; }
          .recruitment-link { background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; word-break: break-all; }
          .benefits { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .benefits ul { padding-left: 20px; }
          .benefits li { margin: 8px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">👑</div>
            <h1>Welcome to the Regional Director Program!</h1>
            <p>Your payment has been approved</p>
          </div>
          <div class="content">
            <p>Dear #{name},</p>
            
            <p><strong>Congratulations! Your Regional Director registration payment has been approved and your account is now active.</strong></p>
            
            <div class="credentials-box">
              <strong>Your Regional Director Code:</strong><br>
              <div class="rd-code">#{rd_code}</div>
              <p style="color: #6b21a8; margin-top: 10px;">Save this code - you'll use it to log in to your dashboard</p>
            </div>
            
            <p style="text-align: center;">
              <a href="#{dashboard_url}" class="button">🚀 Access Your Dashboard</a>
              <a href="#{login_url}" class="button">🔐 Login Page</a>
            </p>
            
            <div class="benefits">
              <h3 style="color: #7c3aed; margin-bottom: 15px;">👑 What You Can Do Now:</h3>
              <ul>
                <li>✓ Access your Regional Director Dashboard</li>
                <li>✓ View your team statistics and earnings</li>
                <li>✓ Track milestone bonuses (10/50/100/500 ambassadors)</li>
                <li>✓ Start recruiting ambassadors using your link below</li>
                <li>✓ Earn 10% override on ALL team sales</li>
                <li>✓ Monitor your tier progression (Bronze → Diamond)</li>
              </ul>
            </div>
            
            <h3 style="color: #1f2937; margin-top: 30px;">📣 Your Personal Recruitment Link:</h3>
            <div class="recruitment-link">
              <a href="#{recruitment_url}" style="color: #7c3aed; font-weight: 600;">#{recruitment_url}</a>
            </div>
            <p style="font-size: 14px; color: #666;">Share this link with potential ambassadors. When they register using this link, they'll be automatically assigned to your team.</p>
            
            <h3 style="color: #1f2937; margin-top: 30px;">� Your Free Book Access:</h3>
            <p style="margin-bottom: 15px;">As a Regional Director, you get FREE access to the Sex By Design book:</p>
            <p style="text-align: center; margin: 20px 0;">
              <a href="https://marriageducation.com/course-viewer.html?courseId=sex-by-design-for-dummies" style="display: inline-block; background: #10b981; color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold;">📖 Access Your Book</a>
            </p>
            
            <h3 style="color: #1f2937; margin-top: 30px;">�💰 Your Earning Structure:</h3>
            <ul style="line-height: 2;">
              <li><strong>10% Override Commission</strong> on every book sold by your team</li>
              <li><strong>Milestone Bonuses:</strong> 100K (10 amb) → 500K (50) → 2M (100) → 10M (500)</li>
              <li><strong>Monthly Bonuses:</strong> 50K-5M FCFA based on your tier</li>
            </ul>
            
            <p style="margin-top: 30px; padding: 20px; background: #fef3c7; border-radius: 8px; border: 2px solid #fbbf24;">
              <strong style="color: #78350f;">🚀 Next Steps:</strong><br>
              <span style="color: #78350f;">
                1. Log in to your dashboard using your RD code<br>
                2. Share your recruitment link with your network<br>
                3. Support your ambassadors as they sell books<br>
                4. Watch your override commissions grow automatically!
              </span>
            </p>
            
            <p style="margin-top: 20px; color: #666; font-size: 14px;">
              Questions? Contact us at <a href="mailto:orders@marriageducation.com" style="color: #7c3aed;">orders@marriageducation.com</a>
            </p>
            
            <p style="margin-top: 30px;">
              <strong>Welcome to the team!</strong><br>
              Marriage Education Team
            </p>
          </div>
        </div>
      </body>
      </html>
    HTML
    
    email_result = send_email(email, subject, html_content)
    puts "[RD CREDENTIALS EMAIL] ✅ Sent to #{email} (#{rd_code})"
    return email_result
  rescue => e
    puts "[RD CREDENTIALS EMAIL ERROR] #{e.message}"
    return false
  end
end

# ============================================================================
# MANUAL PAYMENT SUBMISSION
# ============================================================================

post '/submit-manual-payment' do
  content_type 'application/json'
  
  # Rate limit: 5 submissions per IP per 5 minutes
  check_rate_limit("submit_payment_#{request.ip}", 5, 300)
  
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
      'ambassador_ref' => data['ambassador_ref'] || '',
      'referral_code' => data['referral_code'] || '',
      'timestamp' => data['timestamp'],
      'status' => 'pending',
      'created_at' => Time.now.iso8601
    }
    
    payments_data = read_pending_payments
    payments_data['payments'] << payment
    
    if write_pending_payments(payments_data)
      puts "[MANUAL PAYMENT] New payment submitted: #{payment['reference']} - #{payment['amount']} FCFA"
      puts "[AMBASSADOR] Referred by: #{data['ambassador_ref']}" if data['ambassador_ref'] && !data['ambassador_ref'].empty?
      puts "[REFERRAL] Book Sharer code: #{data['referral_code']}" if data['referral_code'] && !data['referral_code'].empty?
      
      # Send admin notification email (non-blocking)
      Thread.new do
        begin
          send_admin_notification(payment)
          puts "[ADMIN NOTIFICATION] Email sent for payment: #{payment['reference']}"
        rescue => e
          puts "[ADMIN NOTIFICATION] Failed to send: #{e.message}"
        end
      end
      
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
  
  # Rate limit: 60 requests per minute per IP
  check_rate_limit("admin_#{request.ip}", 60, 60)
  
  # Validate admin session
  validate_admin_session
  
  payments_data = read_pending_payments
  payments_data.to_json
end

# Ambassador registration endpoint
post '/submit-ambassador-application' do
  content_type 'application/json'
  
  # Rate limit: 5 applications per hour per IP
  check_rate_limit("ambassador_#{request.ip}", 5, 3600)
  
  begin
    request.body.rewind
    data = JSON.parse(request.body.read)
    
    # Validate required fields
    required_fields = ['fullName', 'email', 'phone', 'city', 'region', 'motivation', 'commitment']
    missing_fields = required_fields.select { |field| data[field].nil? || data[field].to_s.strip.empty? }
    
    if missing_fields.any?
      status 400
      return { success: false, error: "Missing required fields: #{missing_fields.join(', ')}" }.to_json
    end
    
    # Generate unique ambassador code
    timestamp = Time.now.to_i.to_s[-4..-1]
    name_part = data['fullName'].split.first.upcase.gsub(/[^A-Z]/, '')[0..3] || 'AMB'
    ambassador_code = "AMB-#{name_part}-#{timestamp}"
    
    # Generate referral link
    referral_link = "https://marriageducation.com/sbd-campaign.html?ref=#{ambassador_code}"
    
    # Track recruiter (RD or Ambassador) and update their downline
    recruited_by = data['recruitedBy']&.strip&.upcase
    if recruited_by && recruited_by.start_with?('RD-')
      # Update RD downline count
      rd_data = read_regional_directors
      if rd_data['directors'][recruited_by]
        rd_data['directors'][recruited_by]['downline_count'] ||= 0
        rd_data['directors'][recruited_by]['downline_count'] += 1
        
        # Check for milestones
        check_rd_milestones(rd_data['directors'][recruited_by])
        
        write_regional_directors(rd_data)
        puts "[RD DOWNLINE] #{recruited_by} now has #{rd_data['directors'][recruited_by]['downline_count']} ambassadors"
      end
    end
    
    # Track ambassador record in sales file with recruited_by
    sales_data = read_ambassador_sales
    sales_data['ambassadors'][ambassador_code] = {
      'code' => ambassador_code,
      'name' => data['fullName'],
      'email' => data['email'],
      'recruited_by' => recruited_by || '',
      'total_sales' => 0,
      'total_commission' => 0,
      'books_sold' => 0,
      'sales' => [],
      'level' => 'Starter',
      'joined_at' => Time.now.iso8601
    }
    write_ambassador_sales(sales_data)
    
    # Track referrer if provided (for recognition, different from recruited_by)
    referred_by = data['referredBy']&.strip&.upcase
    referrer_bonus_note = referred_by && !referred_by.empty? ? "\n<div class='field'><strong>Referred By:</strong> #{referred_by} (Eligible for 5% referral bonus)</div>" : ''
    recruiter_note = recruited_by && !recruited_by.empty? ? "\n<div class='field'><strong>Recruited By:</strong> #{recruited_by} (Will earn 10% override on all sales)</div>" : ''
    
    # Send notification to orders@marriageducation.com
    admin_email = 'orders@marriageducation.com'
    admin_subject = "🎯 New Ambassador Application - #{data['fullName']}"
    
    html_content = <<~HTML
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #00b894 0%, #00a085 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .section { background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; border-left: 4px solid #00b894; }
          .section h2 { color: #00b894; margin-top: 0; }
          .field { margin-bottom: 12px; }
          .field strong { display: inline-block; width: 180px; color: #555; }
          .badge { background: #00b894; color: white; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: bold; }
          .motivation-box { background: #fffbf0; padding: 15px; border-left: 3px solid #f39c12; border-radius: 4px; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎯 New Ambassador Application</h1>
            <p>Sex By Design Campaign</p>
          </div>
          
          <div class="section">
            <h2>👤 Personal Information</h2>
            <div class="field"><strong>Full Name:</strong> #{data['fullName']}</div>
            <div class="field"><strong>Email:</strong> <a href="mailto:#{data['email']}">#{data['email']}</a></div>
            <div class="field"><strong>Phone/WhatsApp:</strong> #{data['phone']}</div>
            <div class="field"><strong>Location:</strong> #{data['city']}, #{data['region']}</div>
          </div>
          
          <div class="section">
            <h2>📱 Social Media Presence</h2>
            <div class="field"><strong>Primary Platform:</strong> <span class="badge">#{data['primaryPlatform'] || 'Not specified'}</span></div>
            #{data['instagram'] ? "<div class='field'><strong>Instagram:</strong> @#{data['instagram']} (#{data['instagramFollowers'] || 0} followers)</div>" : ''}
            #{data['facebook'] ? "<div class='field'><strong>Facebook:</strong> #{data['facebook']} (#{data['facebookFollowers'] || 0} friends/followers)</div>" : ''}
            #{data['tiktok'] ? "<div class='field'><strong>TikTok:</strong> @#{data['tiktok']}</div>" : ''}
            #{data['linkedin'] ? "<div class='field'><strong>LinkedIn:</strong> #{data['linkedin']}</div>" : ''}
          </div>
          
          <div class="section">
            <h2>🎯 Commitment & Experience</h2>
            <div class="field"><strong>Ambassador Code:</strong> <strong style="color: #00b894;">#{ambassador_code}</strong></div>
            <div class="field"><strong>Referral Link:</strong> <a href="#{referral_link}">#{referral_link}</a></div>
            <div class="field"><strong>Target Commitment:</strong> <strong>#{data['commitment']} books</strong></div>
            <div class="field"><strong>Sales Experience:</strong> #{data['salesExperience'] || 'Not specified'}</div>
            <div class="field"><strong>Referral Source:</strong> #{data['referralSource'] || 'Not specified'}</div>#{recruiter_note}#{referrer_bonus_note}
          </div>
          
          <div class="section">
            <h2>💡 Motivation</h2>
            <div class="motivation-box">#{data['motivation']}</div>
          </div>
          
          <div class="section" style="background: #e8f8f5;">
            <h2>⚡ Next Steps</h2>
            <p>
              ✅ Review application<br>
              ✅ Approve/Reject within 24-48 hours<br>
              ✅ Send welcome email with ambassador code<br>
              ✅ Grant access to dashboard and resources
            </p>
          </div>
        </div>
      </body>
      </html>
    HTML
    
    admin_email_sent = send_email(admin_email, admin_subject, html_content)
    
    # Send welcome email to the ambassador with their referral link
    welcome_subject = "� Welcome Marriage Literacy Ambassador! Your CRLA Journey Begins"
    welcome_html = <<~HTML
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .code-box { background: #2d3436; color: #00b894; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
          .code-box h2 { font-size: 32px; margin: 0; letter-spacing: 2px; }
          .link-box { background: #f8f9fa; padding: 15px; border-radius: 8px; word-break: break-all; margin: 15px 0; }
          .section { padding: 20px; }
          .earnings { background: #f0fdf9; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #00b894; }
          .crla-badge { background: linear-gradient(135deg, #f0fdf9 0%, #ffffff 100%); padding: 20px; border-radius: 8px; border: 2px solid #00b894; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎓 Welcome, Marriage Literacy Ambassador!</h1>
            <p>Your Journey to CRLA Certification Starts Now</p>
          </div>
          <div class="section">
            <p>Hi <strong>#{data['fullName']}</strong>,</p>
            <p>Congratulations! You've joined an elite cohort of ambassadors deploying <strong>Marriage Foundation Access</strong> to families and communities across Cameroon.</p>
            
            <div class="crla-badge">
              <h3 style="color: #00b894; margin: 0 0 8px 0;">Your Track</h3>
              <p style="margin: 0; font-size: 1.1rem;"><strong>Marriage Literacy Ambassador → CRLA Credential</strong></p>
            </div>
            
            <div class="code-box">
              <p style="margin:0; font-size: 14px; opacity: 0.9;">Your Ambassador Code</p>
              <h2>#{ambassador_code}</h2>
            </div>
            
            <div class="link-box">
              <strong>Your Deployment Link:</strong><br>
              <a href="#{referral_link}" style="color: #00b894;">#{referral_link}</a>
            </div>
            
            <div class="earnings">
              <h3 style="color: #00b894; margin-top: 0;">💰 Your 5 Revenue Stacks</h3>
              <p><strong>1. Access Deployment:</strong> 1,500 FCFA per unit (15,000 FCFA → 1,500)</p>
              <p><strong>2. Pathway Activation:</strong> 5-12% on course/school enrollments</p>
              <p><strong>3. Shop & Subscriptions:</strong> 3-6% recurring passive income</p>
              <p><strong>4. Service Routing:</strong> 5-10k FCFA per counseling referral</p>
              <p><strong>5. Training Credits:</strong> Build toward professional certification</p>
            </div>
            
            <h3 style="color: #667eea;">📚 Marriage Foundation School (6 Weeks)</h3>
            <p>You've been enrolled in our intensive training program:</p>
            <ul>
              <li><strong>Teleios Blueprint:</strong> Personal development & maturity ($247 scholarship)</li>
              <li><strong>Advocacy Training:</strong> Deployment psychology & community building</li>
              <li><strong>CRLA Credential:</strong> Certified Relationship Literacy Advocate upon completion</li>
            </ul>
            
            <h3 style="color: #00b894;">🚀 Your First 48 Hours:</h3>
            <ol>
              <li><strong>Access Foundation School:</strong> Begin Week 1 modules</li>
              <li><strong>Join WhatsApp Community:</strong> Connect with fellow ambassadors</li>
              <li><strong>Deploy Your First 3 Units:</strong> Start with close contacts</li>
              <li><strong>Track Progress:</strong> Real-time dashboard access</li>
            </ol>
            
            <h3 style="color: #667eea;">💎 What Makes This Different?</h3>
            <p>You're not "selling books." You're deploying access to a $247 scholarship program that includes:</p>
            <ul>
              <li>✓ Sex By Design for Dummies (textbook, delivered immediately)</li>
              <li>✓ 6-week integrated curriculum (Teleios + Advocacy)</li>
              <li>✓ Professional CRLA credential</li>
              <li>✓ Career pathway to Licensed Counselor (1M+ FCFA monthly)</li>
            </ul>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="https://marriageducation.com/foundation-school.html" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; margin: 8px;">Start Foundation School</a>
              <a href="https://marriageducation.com/ambassador/dashboard.html" style="background: #00b894; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; margin: 8px;">View Dashboard</a>
            </p>
            
            <p style="color: #636e72; font-size: 14px; margin-top: 30px; font-style: italic;">
              "This is not a hustle. This is a pathway." - Welcome to professional marriage advocacy.
            </p>
            
            <p style="color: #636e72; font-size: 14px; margin-top: 20px;">
              Questions? Reply to this email or WhatsApp us at +237 XXX XXX XXX
            </p>
          </div>
        </div>
      </body>
      </html>
    HTML
    
    ambassador_email_sent = send_email(data['email'], welcome_subject, welcome_html)
    
    if admin_email_sent
      puts "[AMBASSADOR] ✅ Application received from #{data['fullName']} (#{data['email']})"
      puts "[AMBASSADOR] 🔗 Generated code: #{ambassador_code}"
      puts "[AMBASSADOR] 📧 Welcome email sent: #{ambassador_email_sent ? 'Yes' : 'No'}"
      puts "[AMBASSADOR] 👥 Referred by: #{referred_by || 'None'}" if referred_by
      
      status 200
      { 
        success: true, 
        message: 'Application submitted successfully',
        ambassadorCode: ambassador_code,
        referralLink: referral_link,
        emailSent: true,
        welcomeEmailSent: ambassador_email_sent,
        recipient: admin_email,
        timestamp: Time.now.iso8601
      }.to_json
    else
      puts "[AMBASSADOR] ❌ Failed to send email for #{data['fullName']}"
      status 500
      { success: false, error: 'Failed to send email notification' }.to_json
    end
    
  rescue JSON::ParserError => e
    status 400
    { success: false, error: 'Invalid JSON data' }.to_json
  rescue => e
    puts "[ERROR] Ambassador submission failed: #{e.message}"
    puts e.backtrace.join("\n")
    status 500
    { success: false, error: e.message }.to_json
  end
end

# Approve payment and send download link
post '/admin/approve-payment' do
  content_type 'application/json'
  
  # Rate limit: 30 approvals per minute per IP
  check_rate_limit("approve_#{request.ip}", 30, 60)
  
  # Validate admin session
  validate_admin_session
  
  begin
    request.body.rewind
    data = JSON.parse(request.body.read)
    reference = data['reference']
    
    payments_data = read_pending_payments
    payment = payments_data['payments'].find { |p| p['reference'] == reference }
    
    if payment
      payment['status'] = 'approved'
      payment['approved_at'] = Time.now.iso8601
      
      # Handle RD registration payment
      if payment['product_id'] == 'rd-registration' && payment['rd_metadata']
        rd_metadata = payment['rd_metadata']
        rd_code = payment['rd_code']
        
        # Create actual RD record in regional_directors.json
        rd_data = read_regional_directors
        rd_data['directors'] ||= {}
        
        rd_data['directors'][rd_code] = {
          'code' => rd_code,
          'name' => "#{rd_metadata['firstName']} #{rd_metadata['lastName']}",
          'email' => rd_metadata['email'],
          'phone' => rd_metadata['phone'],
          'city' => rd_metadata['city'],
          'region' => rd_metadata['region'],
          'is_ambassador' => rd_metadata['is_ambassador'],
          'existing_amb_code' => rd_metadata['existing_amb_code'],
          'leadership_experience' => rd_metadata['leadership_experience'],
          'network_size' => rd_metadata['network_size'],
          'recruitment_target' => rd_metadata['recruitment_target'],
          'motivation' => rd_metadata['motivation'],
          'payment_method' => rd_metadata['payment_method'],
          'registration_fee' => payment['amount'].to_i,
          'status' => 'active',
          'downline_count' => 0,
          'team_books_sold' => 0,
          'override_commission' => 0,
          'tier' => 'Bronze RD',
          'milestones_reached' => [],
          'override_history' => [],
          'application_date' => rd_metadata['application_date'],
          'activation_date' => Time.now.iso8601
        }
        
        write_regional_directors(rd_data)
        puts "[RD ACTIVATION] ✅ #{rd_code} - #{rd_metadata['firstName']} #{rd_metadata['lastName']} activated"
        
        # Send credentials email to new RD and capture result
        email_sent_to_rd = send_rd_credentials_email(rd_code, "#{rd_metadata['firstName']} #{rd_metadata['lastName']}", rd_metadata['email'])
        payment['email_sent_to_rd'] = email_sent_to_rd
      end
      
      # Track commission for ambassador if ref exists
      if payment['ambassador_ref'] && !payment['ambassador_ref'].empty?
        # Get ambassador's recruited_by info
        sales_data = read_ambassador_sales
        recruited_by = nil
        if sales_data['ambassadors'][payment['ambassador_ref']]
          recruited_by = sales_data['ambassadors'][payment['ambassador_ref']]['recruited_by']
        end
        
        track_ambassador_sale(payment['ambassador_ref'], payment['amount'].to_f, payment['reference'], recruited_by)
        puts "[COMMISSION] Tracked sale for #{payment['ambassador_ref']}: #{payment['amount']} FCFA"
      end
      
      # Track referral sale if referral_code exists (Book Sharer Rewards)
      if payment['referral_code'] && !payment['referral_code'].empty?
        track_referral_sale(payment['referral_code'], payment['amount'].to_f)
        puts "[REFERRAL] Tracked sale for referral code #{payment['referral_code']}: #{payment['amount']} FCFA"
      end
      
      if write_pending_payments(payments_data)
        puts "[ADMIN] Payment approved: #{reference}"
        
        # Skip download token generation for RD registration
        unless payment['product_id'] == 'rd-registration'
          # Generate secure download token
          token_data = generate_download_token(payment)
          tokens = read_download_tokens
          tokens['tokens'] << token_data
          write_download_tokens(tokens)
          
          # Build download URL with token - must point to Render backend
          backend_url = ENV['RENDER_EXTERNAL_URL'] || 'https://marriage-education-website.onrender.com'
          download_url = "#{backend_url}/download?token=#{token_data['token']}"
          
          # Send email automatically
          expiry_date = Time.parse(token_data['expires_at']).strftime('%B %d, %Y at %I:%M %p')
          email_html = generate_download_email(payment['product_name'], download_url, expiry_date)
          email_sent = send_email(payment['email'], '📥 Your eBook is Ready to Download', email_html)
          
          # Send download link to CUSTOMER via Telegram/WhatsApp
          telegram_sent = false
          whatsapp_sent = false
          
          customer_msg = <<~MSG
📚 *Marriage Education - Payment Approved*

Hi! Your payment has been approved.

✅ Product: #{payment['product_name']}
💵 Amount: #{payment['amount']} #{payment['currency']}

📥 *Download your eBook here:*
#{download_url}

⏰ Valid until: #{expiry_date}
📊 Downloads allowed: 5 times

Thank you for your purchase!
          MSG
          
          # Try Telegram first (if customer provided username/phone)
          if TELEGRAM_ENABLED && payment['phone'] && !payment['phone'].to_s.empty?
            telegram_sent = send_customer_telegram(payment['phone'], customer_msg)
          end
          
          # Also try WhatsApp if CallMeBot is configured
          if WHATSAPP_ENABLED && payment['phone'] && !payment['phone'].to_s.empty?
            whatsapp_sent = send_customer_whatsapp(payment['phone'], customer_msg)
          end
          
          # Send Telegram notification to ADMIN that payment was approved
          if TELEGRAM_ENABLED
            admin_msg = <<~MSG
✅ *Payment Approved & Sent*

Reference: `#{payment['reference']}`
Customer: #{payment['email']}
Contact: #{payment['phone']}
Product: *#{payment['product_name']}*
Amount: #{payment['amount']} #{payment['currency']}

📧 Email: #{email_sent ? '✅' : '❌'}
📱 Telegram: #{telegram_sent ? '✅ (forwarded to you)' : '❌'}
📱 WhatsApp: #{whatsapp_sent ? '✅' : '❌'}

Download link: #{download_url}
            MSG
            send_telegram(admin_msg)
          end
          
          {
            success: true,
            message: 'Payment approved',
            download_url: download_url,
            email: payment['email'],
            email_sent: email_sent,
            whatsapp_sent: whatsapp_sent,
            token: token_data['token'],
            expires_at: token_data['expires_at']
          }.to_json
        else
          # RD registration approved - credentials already sent
          email_sent_successfully = payment['email_sent_to_rd'] || false
          {
            success: true,
            message: 'RD registration approved and credentials sent',
            email: payment['email'],
            email_sent: email_sent_successfully,
            rd_code: payment['rd_code']
          }.to_json
        end
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
  
  validate_admin_session
  
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
# STRIPE FULFILLMENT ENDPOINT
# ============================================================================

# Fulfill Stripe order - Called by Stripe webhook to send download link
post '/stripe/fulfill-order' do
  content_type 'application/json'
  
  begin
    request.body.rewind
    data = JSON.parse(request.body.read)
    
    customer_email = data['customer_email']
    product_id = data['product_id']
    product_name = data['product_name']
    download_file = data['download_file']
    amount = data['amount']
    stripe_session_id = data['stripe_session_id']
    
    puts "[STRIPE FULFILLMENT] Processing order for #{customer_email}"
    puts "[STRIPE FULFILLMENT] Product: #{product_name} (#{product_id})"
    
    # Generate secure download token (same as manual payment approval)
    token_data = {
      'token' => SecureRandom.hex(32),
      'product_id' => product_id,
      'product_name' => product_name,
      'download_file' => download_file,
      'email' => customer_email,
      'created_at' => Time.now.iso8601,
      'expires_at' => (Time.now + (30 * 24 * 60 * 60)).iso8601, # 30 days
      'max_downloads' => 5,
      'download_count' => 0,
      'status' => 'active',
      'payment_method' => 'stripe',
      'stripe_session_id' => stripe_session_id
    }
    
    # Save token to database
    tokens = read_download_tokens
    tokens['tokens'] << token_data
    write_download_tokens(tokens)
    
    # Build download URL - must point to Render backend
    backend_url = ENV['RENDER_EXTERNAL_URL'] || 'https://marriage-education-website.onrender.com'
    download_url = "#{backend_url}/download?token=#{token_data['token']}"
    
    # Send download email to customer
    expiry_date = Time.parse(token_data['expires_at']).strftime('%B %d, %Y at %I:%M %p')
    email_html = generate_download_email(product_name, download_url, expiry_date)
    customer_email_sent = send_email(customer_email, '📥 Your eBook is Ready to Download', email_html)
    
    puts "[STRIPE FULFILLMENT] Customer email sent: #{customer_email_sent}"
    
    # Send admin notification email
    admin_email_sent = false
    begin
      admin_notification_html = <<~HTML
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000; color: #FFCB05; padding: 20px; text-align: center; }
            .content { background: #f8f9fa; padding: 20px; }
            .info-box { background: #fff; padding: 15px; border-left: 4px solid #000; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>💰 New Stripe Purchase!</h2>
            </div>
            <div class="content">
              <div class="info-box">
                <strong>💳 Payment Method:</strong> Stripe<br>
                <strong>📧 Customer Email:</strong> #{customer_email}<br>
                <strong>📚 Product:</strong> #{product_name}<br>
                <strong>💵 Amount:</strong> #{amount} USD<br>
                <strong>🔑 Session ID:</strong> #{stripe_session_id}<br>
                <strong>⏰ Time:</strong> #{Time.now.strftime('%Y-%m-%d %H:%M:%S')}<br>
                <strong>✅ Status:</strong> Automatically Approved & Fulfilled
              </div>
              
              <p><strong>Download link sent to customer:</strong><br>
              #{download_url}</p>
              
              <p>The customer has been automatically sent their download link via email.</p>
            </div>
          </div>
        </body>
        </html>
      HTML
      
      admin_email = ENV['ADMIN_EMAIL'] || FROM_EMAIL
      admin_email_sent = send_email(admin_email, "💰 New Stripe Purchase - #{product_name}", admin_notification_html)
      puts "[STRIPE FULFILLMENT] Admin notification sent: #{admin_email_sent}"
      
      # Send Telegram notification to admin
      if TELEGRAM_ENABLED
        telegram_msg = <<~MSG
💰 *New Stripe Purchase*

Product: *#{product_name}*
Amount: $#{amount}
Customer: #{customer_email}

✅ Download link sent automatically
Session: `#{stripe_session_id}`
        MSG
        send_telegram(telegram_msg)
      end
    rescue => e
      puts "[STRIPE FULFILLMENT] Failed to send admin notification: #{e.message}"
    end
    
    {
      success: true,
      message: 'Order fulfilled successfully',
      token: token_data['token'],
      download_url: download_url,
      customer_email_sent: customer_email_sent,
      admin_email_sent: admin_email_sent
    }.to_json
    
  rescue => e
    puts "[STRIPE FULFILLMENT ERROR] #{e.message}"
    puts e.backtrace.join("\n")
    halt 500, { error: e.message }.to_json
  end
end

# Get download token by Stripe session ID (for immediate download after payment)
get '/stripe/token-by-session' do
  content_type 'application/json'
  
  session_id = params['session_id']
  
  unless session_id
    halt 400, { error: 'session_id required' }.to_json
  end
  
  tokens = read_download_tokens
  token = tokens['tokens'].find { |t| t['stripe_session_id'] == session_id }
  
  if token
    {
      success: true,
      token: token['token'],
      product_name: token['product_name'],
      expires_at: token['expires_at']
    }.to_json
  else
    halt 404, { error: 'Token not found for this session' }.to_json
  end
end

# Admin: Get all download tokens (for debugging)
get '/admin/tokens' do
  content_type 'application/json'
  
  validate_admin_session
  
  tokens_data = read_download_tokens
  {
    total: tokens_data['tokens'].length,
    tokens: tokens_data['tokens'].map { |t| 
      {
        token: t['token'][0..10] + '...',  # Show first 11 chars for security
        product_id: t['product_id'],
        email: t['email'],
        status: t['status'] || 'active',
        created_at: t['created_at'],
        expires_at: t['expires_at'],
        download_count: t['download_count'],
        max_downloads: t['max_downloads']
      }
    }
  }.to_json
end

# Admin: Get security logs
get '/admin/security-logs' do
  content_type 'application/json'
  
  validate_admin_session
  
  # Get recent events from memory
  recent_events = $failed_attempts.last(100)
  
  # Group by type for summary
  summary = recent_events.group_by { |e| e[:type] }.transform_values(&:count)
  
  {
    total_events: recent_events.length,
    summary: summary,
    recent_events: recent_events.reverse # Most recent first
  }.to_json
end

# ============================================================================
# CUSTOMER SELF-SERVICE ENDPOINTS
# ============================================================================

# Customer: Resend download link
post '/resend-download-link' do
  content_type 'application/json'
  
  # Rate limit: 3 requests per email per hour
  begin
    request.body.rewind
    data = JSON.parse(request.body.read)
    email = data['email']&.downcase&.strip
    
    halt 400, { error: 'Email is required' }.to_json unless email
    
    check_rate_limit("resend_#{email}", 3, 3600)
    
    # Find active tokens for this email
    tokens_data = read_download_tokens
    user_tokens = tokens_data['tokens'].select do |t|
      t['email']&.downcase&.strip == email && 
      t['status'] == 'active' && 
      Time.now < Time.parse(t['expires_at'])
    end
    
    if user_tokens.empty?
      halt 404, { 
        error: 'No active download links found for this email. Please contact support.',
        support_email: 'orders@marriageducation.com'
      }.to_json
    end
    
    # Send email with all active download links
    backend_url = ENV['RENDER_EXTERNAL_URL'] || 'https://marriage-education-website.onrender.com'
    
    links_html = user_tokens.map do |t|
      download_url = "#{backend_url}/download?token=#{t['token']}"
      expiry_date = Time.parse(t['expires_at']).strftime('%B %d, %Y at %I:%M %p')
      remaining_downloads = t['max_downloads'] - t['download_count']
      
      <<~HTML
        <div style="background: #fff; padding: 15px; margin: 15px 0; border-left: 4px solid #FFCB05;">
          <strong>#{t['product_name']}</strong><br>
          <a href="#{download_url}" style="color: #000; font-weight: bold;">📥 Download eBook</a><br>
          <small style="color: #666;">
            Expires: #{expiry_date}<br>
            Remaining downloads: #{remaining_downloads}/#{t['max_downloads']}
          </small>
        </div>
      HTML
    end.join
    
    email_html = <<~HTML
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #FFCB05; color: #000; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>📥 Your Download Links</h2>
          </div>
          <div class="content">
            <p>Here are your active download links:</p>
            #{links_html}
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              If you need further assistance, please contact us at orders@marriageducation.com
            </p>
          </div>
        </div>
      </body>
      </html>
    HTML
    
    if send_email(email, '📥 Your Download Links - Marriage Education', email_html)
      {
        success: true,
        message: "Download links have been sent to #{email}",
        links_sent: user_tokens.length
      }.to_json
    else
      halt 500, { error: 'Failed to send email. Please try again or contact support.' }.to_json
    end
    
  rescue => e
    puts "[ERROR] Resend link: #{e.message}"
    halt 500, { error: 'Internal server error' }.to_json
  end
end

# Admin: Get dashboard statistics
get '/admin/dashboard-stats' do
  content_type 'application/json'
  
  validate_admin_session
  
  begin
    payments_data = read_pending_payments
    tokens_data = read_download_tokens
    
    payments = payments_data['payments']
    tokens = tokens_data['tokens']
    
    # Calculate statistics
    total_payments = payments.length
    pending_payments = payments.count { |p| p['status'] == 'pending' }
    approved_list = payments.select { |p| p['status'] == 'approved' }
    approved_payments = approved_list.count
    rejected_payments = payments.count { |p| p['status'] == 'rejected' }
    
    total_revenue = approved_list.reduce(0) { |sum, p| sum + (p['amount'].to_f || 0) }
    
    active_tokens = tokens.count { |t| t['status'] == 'active' && Time.now < Time.parse(t['expires_at']) }
    expired_tokens = tokens.count { |t| Time.now >= Time.parse(t['expires_at']) }
    
    total_downloads = tokens.reduce(0) { |sum, t| sum + (t['download_count'] || 0) }
    
    # Product breakdown
    products = payments.group_by { |p| p['product_name'] }
      .transform_values { |ps| { count: ps.length, revenue: ps.sum { |p| p['amount'].to_f || 0 } } }
      .sort_by { |_, v| -v[:count] }
      .to_h
    
    # Recent activity (last 7 days)
    week_ago = Time.now - (7 * 24 * 60 * 60)
    recent_payments = payments.count { |p| Time.parse(p['created_at']) > week_ago }
    
    {
      payments: {
        total: total_payments,
        pending: pending_payments,
        approved: approved_payments,
        rejected: rejected_payments,
        recent_week: recent_payments
      },
      revenue: {
        total: total_revenue,
        currency: 'FCFA'
      },
      tokens: {
        active: active_tokens,
        expired: expired_tokens,
        total_downloads: total_downloads
      },
      products: products,
      security: {
        total_events: $failed_attempts.length,
        recent_24h: $failed_attempts.count { |e| Time.parse(e[:timestamp]) > Time.now - 86400 }
      }
    }.to_json
  rescue => e
    puts "[ERROR] Dashboard stats: #{e.message}"
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
  # Rate limit: 10 download attempts per IP per minute
  check_rate_limit("download_#{request.ip}", 10, 60)
  
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
  
  unless token_record
    log_security_event('invalid_download_token', { token: token[0..8] + '...', reason: 'token_not_found' })
    halt 404, 'Invalid or expired download link'
  end
  
  # Check if token is active
  unless token_record['status'] == 'active'
    log_security_event('inactive_token_access', { 
      token: token[0..8] + '...', 
      status: token_record['status'],
      email: token_record['email']
    })
    halt 403, 'Download link has been deactivated'
  end
  
  # Check expiry
  expiry_time = Time.parse(token_record['expires_at'])
  if Time.now > expiry_time
    token_record['status'] = 'expired'
    write_download_tokens(tokens_data)
    log_security_event('expired_token_access', { 
      token: token[0..8] + '...', 
      expired_at: token_record['expires_at'],
      email: token_record['email']
    })
    halt 403, 'Download link has expired. Please contact support.'
  end
  
  # Check download limit
  if token_record['download_count'] >= token_record['max_downloads']
    log_security_event('download_limit_exceeded', { 
      token: token[0..8] + '...', 
      count: token_record['download_count'],
      email: token_record['email']
    })
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
    momo: MTN_MOMO_API_USER ? 'configured' : 'not configured',
    email: (SMTP_USERNAME && SMTP_PASSWORD) ? 'configured' : 'not configured',
    email_settings: (SMTP_USERNAME && SMTP_PASSWORD) ? "#{SMTP_HOST}:#{SMTP_PORT} as #{SMTP_USERNAME}" : 'not configured'
  }.to_json
end

# Root endpoint
get '/' do
  redirect '/payment.html'
end

puts "✅ Server ready on port #{settings.port}"


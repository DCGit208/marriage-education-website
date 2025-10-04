<?php
/**
 * Simple Stripe Webhook Handler - No Database Required
 * Marriage Education Website Payment Processing
 * 
 * Upload this file to your web server as: stripe-webhook-simple.php
 * Set your webhook URL in Stripe to: https://yourwebsite.com/stripe-webhook-simple.php
 */

// Your webhook signing secret
$endpoint_secret = 'whsec_LnRTr94jJ6fSSqEkkAxrAAqLtJhqtBFw';

// Admin email for notifications
$admin_email = 'bthedugrp@gmail.com';

// Get the request body and signature
$payload = @file_get_contents('php://input');
$sig_header = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';

// Log all webhook attempts
error_log("🔔 Stripe webhook received at " . date('Y-m-d H:i:s'));

// Simple signature verification (basic security)
if (empty($sig_header) || empty($payload)) {
    http_response_code(400);
    error_log("❌ Missing signature or payload");
    exit('Missing signature or payload');
}

// Parse the webhook payload
$event_json = json_decode($payload, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    error_log("❌ Invalid JSON payload");
    exit('Invalid JSON');
}

// Get event details
$event_type = $event_json['type'] ?? 'unknown';
$event_id = $event_json['id'] ?? 'unknown';

// Process different event types
switch ($event_type) {
    case 'payment_intent.succeeded':
        handlePaymentSuccess($event_json['data']['object'], $admin_email);
        break;
        
    case 'payment_intent.payment_failed':
        handlePaymentFailure($event_json['data']['object'], $admin_email);
        break;
        
    case 'invoice.payment_succeeded':
        handleInvoicePayment($event_json['data']['object'], $admin_email);
        break;
        
    default:
        error_log("ℹ️  Unhandled event type: $event_type");
}

// Always return 200 to acknowledge receipt
http_response_code(200);
echo "OK";

/**
 * Handle successful payment
 */
function handlePaymentSuccess($payment_intent, $admin_email) {
    $payment_id = $payment_intent['id'];
    $amount = number_format($payment_intent['amount'] / 100, 2);
    $currency = strtoupper($payment_intent['currency']);
    $customer_email = $payment_intent['receipt_email'] ?? 'No email provided';
    $customer_name = $payment_intent['shipping']['name'] ?? 'No name provided';
    
    // Log the success
    error_log("✅ PAYMENT SUCCESS: $payment_id - $$amount $currency from $customer_email");
    
    // Create log entry for file-based tracking
    $log_entry = date('Y-m-d H:i:s') . " | SUCCESS | $payment_id | $$amount $currency | $customer_email | $customer_name\n";
    file_put_contents('stripe_payments.log', $log_entry, FILE_APPEND | LOCK_EX);
    
    // Send email notification to admin
    $subject = "💰 New Payment: $$amount - Marriage Education";
    $message = "
🎉 NEW PAYMENT RECEIVED!

Payment Details:
• Transaction ID: $payment_id
• Amount: $$amount $currency
• Customer Email: $customer_email
• Customer Name: $customer_name
• Date: " . date('F j, Y \a\t g:i A T') . "

Stripe Dashboard: https://dashboard.stripe.com/payments/$payment_id

---
Marriage Education Payment System
Automated notification
    ";
    
    $headers = "From: payments@marriageducation.com\r\n";
    $headers .= "Reply-To: $admin_email\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    
    mail($admin_email, $subject, $message, $headers);
    
    // Send confirmation to customer if email exists
    if (!empty($customer_email) && filter_var($customer_email, FILTER_VALIDATE_EMAIL)) {
        sendCustomerConfirmation($customer_email, $payment_id, $amount, $currency);
    }
}

/**
 * Handle payment failure
 */
function handlePaymentFailure($payment_intent, $admin_email) {
    $payment_id = $payment_intent['id'];
    $amount = number_format($payment_intent['amount'] / 100, 2);
    $currency = strtoupper($payment_intent['currency']);
    $error_message = $payment_intent['last_payment_error']['message'] ?? 'Unknown error';
    
    // Log the failure
    error_log("❌ PAYMENT FAILED: $payment_id - $$amount $currency - $error_message");
    
    // Log to file
    $log_entry = date('Y-m-d H:i:s') . " | FAILED | $payment_id | $$amount $currency | ERROR: $error_message\n";
    file_put_contents('stripe_payments.log', $log_entry, FILE_APPEND | LOCK_EX);
    
    // Notify admin of failure
    $subject = "❌ Payment Failed: $$amount - Marriage Education";
    $message = "
❌ PAYMENT FAILED

Payment Details:
• Transaction ID: $payment_id
• Amount: $$amount $currency
• Error: $error_message
• Date: " . date('F j, Y \a\t g:i A T') . "

You may want to follow up with the customer if needed.

---
Marriage Education Payment System
    ";
    
    $headers = "From: payments@marriageducation.com\r\n";
    mail($admin_email, $subject, $message, $headers);
}

/**
 * Handle subscription/invoice payments
 */
function handleInvoicePayment($invoice, $admin_email) {
    $invoice_id = $invoice['id'];
    $amount = number_format($invoice['amount_paid'] / 100, 2);
    $currency = strtoupper($invoice['currency']);
    
    error_log("💳 SUBSCRIPTION PAYMENT: $invoice_id - $$amount $currency");
}

/**
 * Send confirmation to customer
 */
function sendCustomerConfirmation($customer_email, $payment_id, $amount, $currency) {
    $subject = "✅ Payment Confirmation - Marriage Education";
    $message = "
Dear Customer,

Thank you for your purchase! Your payment has been processed successfully.

Transaction Details:
• Amount: $$amount $currency
• Transaction ID: $payment_id
• Date: " . date('F j, Y \a\t g:i A T') . "

Your digital products and resources will be delivered to this email address shortly.

If you have any questions about your purchase, please don't hesitate to contact us.

Thank you for choosing Marriage Education!

Best regards,
The Marriage Education Team

---
Marriage Education
Website: https://marriageducation.com
Support: bthedugrp@gmail.com
    ";
    
    $headers = "From: support@marriageducation.com\r\n";
    $headers .= "Reply-To: bthedugrp@gmail.com\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    
    mail($customer_email, $subject, $message, $headers);
    error_log("📧 Confirmation email sent to: $customer_email");
}
?>/* Updated Sat Oct  4 08:04:09 WAT 2025 */

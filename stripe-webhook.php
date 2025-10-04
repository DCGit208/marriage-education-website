<?php
/**
 * Stripe Webhook Handler for Marriage Education Website
 * This file processes Stripe webhook events securely
 */

// Your Stripe webhook endpoint secret
$endpoint_secret = 'whsec_LnRTr94jJ6fSSqEkkAxrAAqLtJhqtBFw';

// Get the payload and signature
$payload = @file_get_contents('php://input');
$sig_header = $_SERVER['HTTP_STRIPE_SIGNATURE'];

// Verify the webhook signature
try {
    $event = \Stripe\Webhook::constructEvent(
        $payload, $sig_header, $endpoint_secret
    );
} catch(\UnexpectedValueException $e) {
    // Invalid payload
    http_response_code(400);
    exit();
} catch(\Stripe\Exception\SignatureVerificationException $e) {
    // Invalid signature
    http_response_code(400);
    exit();
}

// Handle the event
switch ($event['type']) {
    case 'payment_intent.succeeded':
        $paymentIntent = $event['data']['object'];
        
        // Extract payment details
        $amount = $paymentIntent['amount'] / 100; // Convert from cents
        $currency = strtoupper($paymentIntent['currency']);
        $customer_email = $paymentIntent['receipt_email'] ?? 'No email provided';
        $payment_id = $paymentIntent['id'];
        
        // Log the successful payment
        error_log("✅ Payment Success: $payment_id - $$amount $currency from $customer_email");
        
        // Send confirmation email to customer and admin
        sendPaymentConfirmation($paymentIntent);
        
        break;
        
    case 'payment_intent.payment_failed':
        $paymentIntent = $event['data']['object'];
        $payment_id = $paymentIntent['id'];
        
        error_log("❌ Payment Failed: $payment_id");
        
        break;
        
    default:
        error_log('Received unknown event type: ' . $event['type']);
}

http_response_code(200);

/**
 * Send payment confirmation emails
 */
function sendPaymentConfirmation($paymentIntent) {
    $amount = $paymentIntent['amount'] / 100;
    $currency = strtoupper($paymentIntent['currency']);
    $payment_id = $paymentIntent['id'];
    $customer_email = $paymentIntent['receipt_email'] ?? '';
    
    // Email to admin (you)
    $admin_email = 'bthedugrp@gmail.com';
    $subject = '💰 New Payment Received - Marriage Education';
    
    $message = "
    🎉 NEW PAYMENT RECEIVED!
    
    Payment ID: $payment_id
    Amount: $$amount $currency
    Customer Email: $customer_email
    Date: " . date('Y-m-d H:i:s') . "
    
    Payment processed successfully through Stripe.
    
    ---
    Marriage Education Payment System
    ";
    
    $headers = "From: noreply@marriageducation.com\r\n";
    $headers .= "Reply-To: noreply@marriageducation.com\r\n";
    $headers .= "X-Mailer: PHP/" . phpversion();
    
    mail($admin_email, $subject, $message, $headers);
    
    // Email to customer (if email provided)
    if (!empty($customer_email)) {
        $customer_subject = '✅ Payment Confirmation - Marriage Education';
        $customer_message = "
        Thank you for your purchase!
        
        Payment Details:
        - Amount: $$amount $currency
        - Transaction ID: $payment_id
        - Date: " . date('Y-m-d H:i:s') . "
        
        Your digital products will be available shortly.
        
        Thank you for choosing Marriage Education!
        
        ---
        Marriage Education
        Website: https://marriageducation.com
        Support: bthedugrp@gmail.com
        ";
        
        mail($customer_email, $customer_subject, $customer_message, $headers);
    }
}
?>
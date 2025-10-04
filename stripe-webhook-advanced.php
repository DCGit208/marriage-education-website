<?php
/**
 * Advanced Stripe Webhook Handler with Database Logging
 * Marriage Education Website Payment Processing
 */

// Database configuration (update with your database details)
$db_host = 'localhost';
$db_name = 'marriage_education';
$db_user = 'your_db_user';
$db_pass = 'your_db_password';

// Stripe webhook secret
$endpoint_secret = 'whsec_LnRTr94jJ6fSSqEkkAxrAAqLtJhqtBFw';

// Initialize database connection
try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    error_log("Database connection failed: " . $e->getMessage());
    // Continue without database logging
    $pdo = null;
}

// Get the payload and verify signature
$payload = @file_get_contents('php://input');
$sig_header = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';

try {
    $event = \Stripe\Webhook::constructEvent($payload, $sig_header, $endpoint_secret);
} catch(\Exception $e) {
    http_response_code(400);
    error_log("Webhook signature verification failed: " . $e->getMessage());
    exit();
}

// Process the event
switch ($event['type']) {
    case 'payment_intent.succeeded':
        handleSuccessfulPayment($event['data']['object'], $pdo);
        break;
        
    case 'payment_intent.payment_failed':
        handleFailedPayment($event['data']['object'], $pdo);
        break;
        
    case 'customer.created':
        handleNewCustomer($event['data']['object'], $pdo);
        break;
        
    default:
        error_log('Unhandled event type: ' . $event['type']);
}

http_response_code(200);

function handleSuccessfulPayment($paymentIntent, $pdo) {
    $payment_id = $paymentIntent['id'];
    $amount = $paymentIntent['amount'] / 100;
    $currency = strtoupper($paymentIntent['currency']);
    $customer_email = $paymentIntent['receipt_email'] ?? '';
    $status = 'completed';
    
    // Log to database if available
    if ($pdo) {
        try {
            $stmt = $pdo->prepare("
                INSERT INTO payments (
                    stripe_payment_id, amount, currency, customer_email, 
                    status, created_at, metadata
                ) VALUES (?, ?, ?, ?, ?, NOW(), ?)
            ");
            
            $metadata = json_encode($paymentIntent);
            $stmt->execute([
                $payment_id, $amount, $currency, $customer_email, 
                $status, $metadata
            ]);
            
        } catch(PDOException $e) {
            error_log("Database insert failed: " . $e->getMessage());
        }
    }
    
    // Send notifications
    sendNotifications($payment_id, $amount, $currency, $customer_email, 'success');
    
    // Log success
    error_log("✅ Payment processed: $payment_id - $$amount $currency");
}

function handleFailedPayment($paymentIntent, $pdo) {
    $payment_id = $paymentIntent['id'];
    $amount = $paymentIntent['amount'] / 100;
    $currency = strtoupper($paymentIntent['currency']);
    
    // Log failure
    error_log("❌ Payment failed: $payment_id - $$amount $currency");
    
    // Optionally log to database
    if ($pdo) {
        try {
            $stmt = $pdo->prepare("
                INSERT INTO payment_failures (
                    stripe_payment_id, amount, currency, reason, created_at
                ) VALUES (?, ?, ?, ?, NOW())
            ");
            
            $reason = $paymentIntent['last_payment_error']['message'] ?? 'Unknown error';
            $stmt->execute([$payment_id, $amount, $currency, $reason]);
            
        } catch(PDOException $e) {
            error_log("Failed payment logging error: " . $e->getMessage());
        }
    }
}

function handleNewCustomer($customer, $pdo) {
    $customer_id = $customer['id'];
    $email = $customer['email'] ?? '';
    $name = $customer['name'] ?? '';
    
    error_log("👤 New customer: $customer_id - $email");
}

function sendNotifications($payment_id, $amount, $currency, $customer_email, $type) {
    // Admin notification
    $admin_email = 'bthedugrp@gmail.com';
    $subject = ($type === 'success') ? 
        '💰 Payment Received - Marriage Education' : 
        '❌ Payment Failed - Marriage Education';
    
    $admin_message = "
    Payment Update:
    
    Transaction ID: $payment_id
    Amount: $$amount $currency
    Customer: $customer_email
    Status: " . ucfirst($type) . "
    Date: " . date('Y-m-d H:i:s T') . "
    
    ---
    Automated notification from Marriage Education payment system
    ";
    
    $headers = "From: payments@marriageducation.com\r\n";
    $headers .= "Reply-To: bthedugrp@gmail.com\r\n";
    
    mail($admin_email, $subject, $admin_message, $headers);
    
    // Customer notification for successful payments
    if ($type === 'success' && !empty($customer_email)) {
        $customer_subject = '✅ Payment Confirmation - Marriage Education';
        $customer_message = "
        Dear Customer,
        
        Thank you for your purchase! Your payment has been processed successfully.
        
        Transaction Details:
        • Amount: $$amount $currency
        • Transaction ID: $payment_id
        • Date: " . date('F j, Y \a\t g:i A T') . "
        
        Your digital products and resources will be available shortly.
        
        If you have any questions, please contact us at bthedugrp@gmail.com
        
        Thank you for choosing Marriage Education!
        
        Best regards,
        The Marriage Education Team
        https://marriageducation.com
        ";
        
        mail($customer_email, $customer_subject, $customer_message, $headers);
    }
}
?>
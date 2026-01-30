<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

// Get JSON input
$input = file_get_contents('php://input');
$data = json_decode($input, true);

// Validate required fields
$required = ['email', 'fullName', 'code', 'bookUrl'];
foreach ($required as $field) {
    if (empty($data[$field])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => "Missing required field: $field"]);
        exit();
    }
}

$email = filter_var($data['email'], FILTER_SANITIZE_EMAIL);
$fullName = htmlspecialchars($data['fullName']);
$code = htmlspecialchars($data['code']);
$bookUrl = filter_var($data['bookUrl'], FILTER_SANITIZE_URL);

// Calculate expiry date (7 days from now)
$expiryDate = date('F j, Y', strtotime('+7 days'));

// Email configuration
$to = $email;
$from = 'orders@marriageducation.com';
$fromName = 'Marriage Education';
$replyTo = 'orders@marriageducation.com';
$subject = "Welcome Ambassador $code - Your Credentials Inside";

// HTML email body
$html = <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #2d3436; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #00b894 0%, #00a085 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #00b894; }
        .box h3 { color: #2d3436; margin-top: 0; }
        .code { font-family: monospace; font-size: 20px; color: #00b894; font-weight: bold; }
        .button { display: inline-block; background: #00b894; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        .footer { text-align: center; padding: 20px; color: #636e72; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎯 Welcome, Ambassador $fullName!</h1>
        </div>
        <div class="content">
            <p>Congratulations! Your ambassador registration has been approved.</p>
            
            <div class="box">
                <h3>📋 Your Ambassador Credentials</h3>
                <p><strong>Ambassador Code:</strong> <span class="code">$code</span></p>
                <p><strong>Email:</strong> $email</p>
                <p><strong>Dashboard:</strong> <a href="https://marriageducation.com/ambassador-login.html" style="color: #00b894;">Login Here</a></p>
            </div>
            
            <div class="box">
                <h3>📚 Your Book Download</h3>
                <p>Download your book package now. This link expires in 7 days ($expiryDate).</p>
                <a href="$bookUrl" class="button">📥 Download Book</a>
                <p style="font-size: 12px; color: #636e72; margin-top: 10px;">If the button doesn't work, copy this link:<br>$bookUrl</p>
            </div>
            
            <h3>🚀 Next Steps:</h3>
            <ol>
                <li>Download and read your book package</li>
                <li>Log in to your ambassador dashboard at <strong>marriageducation.com/ambassador-login.html</strong></li>
                <li>Get your unique referral link</li>
                <li>Start sharing and earning commissions!</li>
            </ol>
            
            <p><strong>Questions?</strong> Reply to this email or contact support@marriageducation.com</p>
        </div>
        <div class="footer">
            <p>Marriage Education | marriageducation.com</p>
        </div>
    </div>
</body>
</html>
HTML;

// Plain text version for better deliverability
$plainText = <<<TEXT
Welcome, Ambassador $fullName!

Congratulations! Your ambassador registration has been approved.

YOUR AMBASSADOR CREDENTIALS
============================
Ambassador Code: $code
Email: $email
Dashboard: https://marriageducation.com/ambassador-login.html

YOUR BOOK DOWNLOAD
==================
Download your book package now. This link expires in 7 days ($expiryDate).

Book Download Link:
$bookUrl

NEXT STEPS
==========
1. Download and read your book package
2. Log in to your ambassador dashboard at marriageducation.com/ambassador-login.html
3. Get your unique referral link
4. Start sharing and earning commissions!

Questions? Reply to this email or contact support@marriageducation.com

---
Marriage Education | marriageducation.com
TEXT;

// Create multipart message boundary
$boundary = md5(time());

// Enhanced email headers to avoid spam
$headers = "From: $fromName <$from>\r\n";
$headers .= "Reply-To: $replyTo\r\n";
$headers .= "Return-Path: $from\r\n";
$headers .= "X-Priority: 3\r\n";
$headers .= "X-Mailer: PHP/" . phpversion() . "\r\n";
$headers .= "Organization: Marriage Education\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: multipart/alternative; boundary=\"$boundary\"\r\n";

// Build multipart message body
$body = "--$boundary\r\n";
$body .= "Content-Type: text/plain; charset=UTF-8\r\n";
$body .= "Content-Transfer-Encoding: 7bit\r\n\r\n";
$body .= $plainText . "\r\n\r\n";
$body .= "--$boundary\r\n";
$body .= "Content-Type: text/html; charset=UTF-8\r\n";
$body .= "Content-Transfer-Encoding: 7bit\r\n\r\n";
$body .= $html . "\r\n\r\n";
$body .= "--$boundary--";

// Send email
$mailSent = mail($to, $subject, $body, $headers);

// Log the attempt
$logDir = __DIR__ . '/logs';
if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}

$timestamp = date('Y-m-d H:i:s');
$logEntry = "[$timestamp] ";

if ($mailSent) {
    $logEntry .= "✅ SUCCESS - Sent credentials to $email ($fullName - $code)\n";
    
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Email sent successfully',
        'recipient' => $email,
        'code' => $code
    ]);
} else {
    $logEntry .= "❌ FAILED - Could not send to $email ($fullName - $code)\n";
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to send email via PHP mail()',
        'recipient' => $email
    ]);
}

@file_put_contents($logDir . '/ambassador-credentials.log', $logEntry, FILE_APPEND);
?>

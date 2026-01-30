<?php
/**
 * Payment Confirmation Email Endpoint
 * Receives POST from Firebase and sends email using iPage mail()
 * 
 * Architecture: Firebase Cloud Function → iPage PHP → mail()
 * This bypasses Firebase IP blacklisting by Spamhaus
 */

// ===== CONFIG =====
$SECRET = "MEG2026_SECURE_TOKEN_CHANGE_THIS";
$FROM_EMAIL = "orders@marriageducation.com";
$FROM_NAME = "Marriage Education";

// ===== CORS HEADERS (for preflight) =====
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ===== SECURITY CHECK =====
$headers = getallheaders();

if (!isset($headers['Authorization'])) {
    http_response_code(401);
    echo json_encode(["error" => "Unauthorized - No token provided"]);
    exit();
}

if ($headers['Authorization'] !== "Bearer $SECRET") {
    http_response_code(403);
    echo json_encode(["error" => "Forbidden - Invalid token"]);
    exit();
}

// ===== READ JSON BODY =====
$payload = json_decode(file_get_contents("php://input"), true);

if (!$payload) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid JSON payload"]);
    exit();
}

// Extract and validate fields
$email = isset($payload['email']) ? filter_var($payload['email'], FILTER_VALIDATE_EMAIL) : false;
$fullName = isset($payload['fullName']) ? htmlspecialchars($payload['fullName']) : '';
$code = isset($payload['code']) ? htmlspecialchars($payload['code']) : '';
$bookUrl = isset($payload['bookUrl']) ? htmlspecialchars($payload['bookUrl']) : '';

if (!$email || !$fullName || !$code || !$bookUrl) {
    http_response_code(400);
    echo json_encode(["error" => "Missing required fields: email, fullName, code, bookUrl"]);
    exit();
}

// ===== EMAIL CONTENT =====
$expiryDate = date('F j, Y', strtotime('+7 days'));
$subject = "Welcome Ambassador $code - Your Credentials Inside";

// HTML version
$htmlMessage = "
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #00b894 0%, #00a085 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; }
        .credentials { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #00b894; }
        .button { display: inline-block; background: #00b894; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
        .footer { background: #2d3436; color: white; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; }
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>🎉 Welcome, Ambassador $fullName!</h1>
            <p>Your registration has been approved</p>
        </div>
        
        <div class='content'>
            <h2>Your Ambassador Credentials</h2>
            
            <div class='credentials'>
                <p><strong>Ambassador Code:</strong> $code</p>
                <p><strong>Email:</strong> $email</p>
                <p><strong>Dashboard:</strong> <a href='https://marriageducation.com/ambassador-login.html'>marriageducation.com/ambassador-login.html</a></p>
            </div>
            
            <h3>📚 Your Book Download</h3>
            <p>Download your book package now. This link expires on <strong>$expiryDate</strong>.</p>
            
            <a href='$bookUrl' class='button'>📥 Download Book Package</a>
            
            <h3>Next Steps:</h3>
            <ol>
                <li>Download and read your book package</li>
                <li>Log in to your ambassador dashboard</li>
                <li>Get your unique referral link</li>
                <li>Start sharing and earning commissions!</li>
            </ol>
            
            <p><strong>Questions?</strong> Reply to this email or contact support@marriageducation.com</p>
        </div>
        
        <div class='footer'>
            <p>Marriage Education | marriageducation.com</p>
            <p>Empowering marriages, one family at a time</p>
        </div>
    </div>
</body>
</html>
";

// Plain text version
$textMessage = "
Welcome, Ambassador $fullName!

Congratulations! Your ambassador registration has been approved.

YOUR AMBASSADOR CREDENTIALS
============================
Ambassador Code: $code
Email: $email
Dashboard: https://marriageducation.com/ambassador-login.html

YOUR BOOK DOWNLOAD
==================
Download your book package now. This link expires on $expiryDate.

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
Empowering marriages, one family at a time
";

// ===== EMAIL HEADERS (multipart for HTML + plain text) =====
$boundary = md5(time());

$headers = "From: $FROM_NAME <$FROM_EMAIL>\r\n";
$headers .= "Reply-To: $FROM_EMAIL\r\n";
$headers .= "Return-Path: $FROM_EMAIL\r\n";
$headers .= "X-Priority: 3\r\n";
$headers .= "X-Mailer: PHP/" . phpversion() . "\r\n";
$headers .= "Organization: Marriage Education\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: multipart/alternative; boundary=\"$boundary\"\r\n";

// Build multipart message body
$body = "--$boundary\r\n";
$body .= "Content-Type: text/plain; charset=UTF-8\r\n";
$body .= "Content-Transfer-Encoding: 7bit\r\n\r\n";
$body .= $textMessage . "\r\n\r\n";
$body .= "--$boundary\r\n";
$body .= "Content-Type: text/html; charset=UTF-8\r\n";
$body .= "Content-Transfer-Encoding: 7bit\r\n\r\n";
$body .= $htmlMessage . "\r\n\r\n";
$body .= "--$boundary--";

// ===== SEND EMAIL =====
$mailSent = mail($email, $subject, $body, $headers);

// ===== LOG =====
$logDir = __DIR__ . '/../../logs';
if (!is_dir($logDir)) {
    mkdir($logDir, 0755, true);
}

$logFile = $logDir . '/email-confirmation-' . date('Y-m-d') . '.log';
$logEntry = date('[Y-m-d H:i:s]') . " Email to $email ($code) - " . ($mailSent ? "SUCCESS" : "FAILED") . "\n";
file_put_contents($logFile, $logEntry, FILE_APPEND);

// ===== RESPONSE =====
if ($mailSent) {
    http_response_code(200);
    echo json_encode([
        "status" => "sent",
        "email" => $email,
        "code" => $code,
        "timestamp" => date('Y-m-d H:i:s')
    ]);
} else {
    http_response_code(500);
    echo json_encode([
        "status" => "failed",
        "error" => "mail() function returned false",
        "email" => $email
    ]);
}
?>

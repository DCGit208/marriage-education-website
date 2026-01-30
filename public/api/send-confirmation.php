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
$currentYear = date('Y');
$subject = "Your Ambassador Account is Active - Code: $code";

// HTML version
$htmlMessage = "
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f4f4f4; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background: white; }
        .header { background: linear-gradient(135deg, #00b894 0%, #00a085 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .credentials { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #00b894; }
        .button { display: inline-block; background: #00b894; color: white !important; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
        a { color: #00b894; }
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>Welcome to Marriage Education</h1>
            <p>Ambassador Registration Approved</p>
        </div>
        
        <div class='content'>
            <p>Hello $fullName,</p>
            
            <p>Congratulations! Your ambassador application has been approved and your account is now active.</p>
            
            <div class='credentials'>
                <p><strong>Ambassador Code:</strong> $code</p>
                <p><strong>Login Email:</strong> $email</p>
                <p><strong>Dashboard Login:</strong> <a href='https://marriageducation.com/ambassador-login.html'>marriageducation.com/ambassador-login.html</a></p>
            </div>
            
            <h3>Your Book Package</h3>
            <p>As part of your ambassador benefits, you can download your book package. This download link will remain active until $expiryDate.</p>
            
            <center>
                <a href='$bookUrl' class='button'>Download Book Package</a>
            </center>
            
            <h3>Getting Started</h3>
            <ol>
                <li>Download your book package using the link above</li>
                <li>Log in to your ambassador dashboard</li>
                <li>Copy your unique referral link</li>
                <li>Share with your network and earn commissions</li>
            </ol>
            
            <p>If you have questions, please reply to this email or contact us at support@marriageducation.com</p>
            
            <p>Best regards,<br>
            Marriage Education Team</p>
        </div>
        
        <div class='footer'>
            <p><strong>Marriage Education</strong></p>
            <p>Empowering marriages, one family at a time</p>
            <p>&copy; $currentYear Marriage Education. All rights reserved.</p>
            <p style='margin-top:10px;'><a href='https://marriageducation.com'>marriageducation.com</a> | <a href='mailto:support@marriageducation.com'>support@marriageducation.com</a></p>
            <p style='margin-top:10px; font-size:11px;'>You received this email because you registered as an ambassador at marriageducation.com</p>
        </div>
    </div>
</body>
</html>
";

// Plain text version
$textMessage = "
Welcome to Marriage Education
Ambassador Registration Approved

Hello $fullName,

Congratulations! Your ambassador application has been approved and your account is now active.

YOUR AMBASSADOR CREDENTIALS
============================
Ambassador Code: $code
Login Email: $email
Dashboard Login: https://marriageducation.com/ambassador-login.html

YOUR BOOK PACKAGE
==================
As part of your ambassador benefits, you can download your book package. 
This download link will remain active until $expiryDate.

Download Book Package:
$bookUrl

GETTING STARTED
===============
1. Download your book package using the link above
2. Log in to your ambassador dashboard
3. Copy your unique referral link
4. Share with your network and earn commissions

If you have questions, please reply to this email or contact us at support@marriageducation.com

Best regards,
Marriage Education Team

---
Marriage Education
Empowering marriages, one family at a time
(c) $currentYear Marriage Education. All rights reserved.

marriageducation.com | support@marriageducation.com

You received this email because you registered as an ambassador at marriageducation.com
";

// ===== EMAIL HEADERS (multipart for HTML + plain text) =====
$boundary = md5(time());
$messageId = "<" . md5(uniqid(time())) . "@marriageducation.com>";

$headers = "From: $FROM_NAME <$FROM_EMAIL>\r\n";
$headers .= "Reply-To: $FROM_EMAIL\r\n";
$headers .= "Return-Path: $FROM_EMAIL\r\n";
$headers .= "Message-ID: $messageId\r\n";
$headers .= "X-Priority: 3\r\n";
$headers .= "X-Mailer: Marriage Education v1.0\r\n";
$headers .= "Organization: Marriage Education\r\n";
$headers .= "List-Unsubscribe: <mailto:unsubscribe@marriageducation.com>\r\n";
$headers .= "Precedence: bulk\r\n";
$headers .= "X-Auto-Response-Suppress: OOF, DR, RN, NRN, AutoReply\r\n";
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

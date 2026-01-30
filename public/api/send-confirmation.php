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
$subject = "Account Activated: $code";

// HTML version
$htmlMessage = "
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
</head>
<body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;'>
    <table width='100%' cellpadding='0' cellspacing='0' style='background: #f4f4f4; padding: 20px;'>
        <tr>
            <td align='center'>
                <table width='600' cellpadding='0' cellspacing='0' style='background: white; border: 1px solid #ddd;'>
                    <tr>
                        <td style='padding: 30px; background: #00b894; color: white; text-align: center;'>
                            <h1 style='margin: 0; font-size: 24px;'>Account Activated</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style='padding: 30px;'>
                            <p>Hello $fullName,</p>
                            
                            <p>Your account has been activated. You can now log in using the credentials below.</p>
                            
                            <table width='100%' cellpadding='15' cellspacing='0' style='background: #f8f9fa; border-left: 4px solid #00b894; margin: 20px 0;'>
                                <tr>
                                    <td>
                                        <p style='margin: 5px 0;'><strong>Account Code:</strong> $code</p>
                                        <p style='margin: 5px 0;'><strong>Email:</strong> $email</p>
                                        <p style='margin: 5px 0;'><strong>Login URL:</strong> marriageducation.com/ambassador-login.html</p>
                                    </td>
                                </tr>
                            </table>
                            
                            <p><strong>Account Resources</strong></p>
                            <p>Your account includes access to digital resources. Download link valid until $expiryDate:</p>
                            <p><a href='$bookUrl' style='color: #00b894;'>$bookUrl</a></p>
                            
                            <p style='margin-top: 30px;'>If you have questions, reply to this email.</p>
                            
                            <p>Marriage Education Team</p>
                        </td>
                    </tr>
                    <tr>
                        <td style='padding: 20px; background: #f8f9fa; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd;'>
                            <p style='margin: 5px 0;'>Marriage Education</p>
                            <p style='margin: 5px 0;'>marriageducation.com</p>
                            <p style='margin: 10px 0; font-size: 11px;'>This is an automated account notification. You received this because you registered an account with us.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
";

// Plain text version
$textMessage = "
Account Activated

Hello $fullName,

Your account has been activated. You can now log in using the credentials below.

ACCOUNT CREDENTIALS
===================
Account Code: $code
Email: $email
Login URL: https://marriageducation.com/ambassador-login.html

ACCOUNT RESOURCES
=================
Your account includes access to digital resources.
Download link valid until $expiryDate:

$bookUrl

If you have questions, reply to this email.

Marriage Education Team

---
Marriage Education
marriageducation.com

This is an automated account notification. You received this because you registered an account with us.
";

// ===== EMAIL HEADERS (multipart for HTML + plain text) =====
$boundary = md5(time());
$messageId = "<" . md5(uniqid(time())) . "@marriageducation.com>";

$headers = "From: $FROM_NAME <$FROM_EMAIL>\r\n";
$headers .= "Reply-To: $FROM_EMAIL\r\n";
$headers .= "Return-Path: $FROM_EMAIL\r\n";
$headers .= "Message-ID: $messageId\r\n";
$headers .= "Date: " . date('r') . "\r\n";
$headers .= "X-Priority: 3\r\n";
$headers .= "X-Mailer: Marriage Education Account System\r\n";
$headers .= "X-MSMail-Priority: Normal\r\n";
$headers .= "Importance: Normal\r\n";
$headers .= "Auto-Submitted: auto-generated\r\n";
$headers .= "X-Auto-Response-Suppress: All\r\n";
$headers .= "List-Unsubscribe: <mailto:unsubscribe@marriageducation.com>\r\n";
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

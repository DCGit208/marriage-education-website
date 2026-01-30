<?php
/**
 * Send Ambassador Credentials via iPage SMTP
 * Using PHPMailer with proper SMTP authentication
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

// Get input
$input = file_get_contents('php://input');
$data = json_decode($input, true);

// Validate
$required = ['email', 'fullName', 'code', 'bookUrl'];
foreach ($required as $field) {
    if (empty($data[$field])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => "Missing: $field"]);
        exit();
    }
}

$to = filter_var($data['email'], FILTER_SANITIZE_EMAIL);
$fullName = htmlspecialchars($data['fullName']);
$code = htmlspecialchars($data['code']);
$bookUrl = filter_var($data['bookUrl'], FILTER_SANITIZE_URL);
$expiryDate = date('F j, Y', strtotime('+7 days'));

// iPage SMTP Configuration
$smtp_host = 'smtp.ipage.com';
$smtp_port = 587;
$smtp_user = 'orders@marriageducation.com';
$smtp_pass = 'Fi5%%%orderBTH123';
$smtp_from = 'orders@marriageducation.com';
$smtp_from_name = 'Marriage Education';

// Email content
$subject = "Welcome Ambassador $code - Your Credentials Inside";

$html = <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #2d3436; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #00b894 0%, #00a085 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #00b894; }
        .code { font-family: monospace; font-size: 20px; color: #00b894; font-weight: bold; }
        .button { display: inline-block; background: #00b894; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; }
        .footer { text-align: center; padding: 20px; color: #636e72; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome, Ambassador $fullName!</h1>
        </div>
        <div class="content">
            <p>Congratulations! Your ambassador registration has been approved.</p>
            <div class="box">
                <h3>Your Ambassador Credentials</h3>
                <p><strong>Ambassador Code:</strong> <span class="code">$code</span></p>
                <p><strong>Email:</strong> $to</p>
                <p><strong>Dashboard:</strong> <a href="https://marriageducation.com/ambassador-login.html">Login Here</a></p>
            </div>
            <div class="box">
                <h3>Your Book Download</h3>
                <p>Download your book package now. Expires: $expiryDate</p>
                <a href="$bookUrl" class="button">Download Book</a>
            </div>
            <h3>Next Steps:</h3>
            <ol>
                <li>Download and read your book package</li>
                <li>Log in to your ambassador dashboard</li>
                <li>Get your unique referral link</li>
                <li>Start sharing and earning commissions!</li>
            </ol>
        </div>
        <div class="footer">
            <p>Marriage Education | marriageducation.com</p>
        </div>
    </div>
</body>
</html>
HTML;

$plainText = "Welcome, Ambassador $fullName!\n\nAmbassador Code: $code\nEmail: $to\nDashboard: https://marriageducation.com/ambassador-login.html\n\nBook Download: $bookUrl\nExpires: $expiryDate";

// Create multipart message
$boundary = md5(time());

$headers = "From: $smtp_from_name <$smtp_from>\r\n";
$headers .= "Reply-To: $smtp_from\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: multipart/alternative; boundary=\"$boundary\"\r\n";

$body = "--$boundary\r\n";
$body .= "Content-Type: text/plain; charset=UTF-8\r\n\r\n";
$body .= $plainText . "\r\n\r\n";
$body .= "--$boundary\r\n";
$body .= "Content-Type: text/html; charset=UTF-8\r\n\r\n";
$body .= $html . "\r\n\r\n";
$body .= "--$boundary--";

// SMTP Send using socket connection
$socket = fsockopen($smtp_host, $smtp_port, $errno, $errstr, 30);
if (!$socket) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => "SMTP connection failed: $errstr ($errno)"]);
    exit();
}

stream_set_timeout($socket, 30);

// Helper function
function smtp_cmd($socket, $cmd, $expected_code) {
    fwrite($socket, $cmd . "\r\n");
    $response = fgets($socket, 512);
    $code = substr($response, 0, 3);
    if ($code != $expected_code) {
        return ['success' => false, 'response' => $response];
    }
    return ['success' => true, 'response' => $response];
}

// SMTP conversation
$result = smtp_cmd($socket, "EHLO marriageducation.com", 250);
if (!$result['success']) {
    fclose($socket);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'EHLO failed: ' . $result['response']]);
    exit();
}

// Start TLS if port 587
if ($smtp_port == 587) {
    $result = smtp_cmd($socket, "STARTTLS", 220);
    if (!$result['success']) {
        fclose($socket);
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'STARTTLS failed: ' . $result['response']]);
        exit();
    }
    
    stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
    $result = smtp_cmd($socket, "EHLO marriageducation.com", 250);
}

// AUTH LOGIN
$result = smtp_cmd($socket, "AUTH LOGIN", 334);
if (!$result['success']) {
    fclose($socket);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'AUTH failed: ' . $result['response']]);
    exit();
}

$result = smtp_cmd($socket, base64_encode($smtp_user), 334);
if (!$result['success']) {
    fclose($socket);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Username failed']);
    exit();
}

$result = smtp_cmd($socket, base64_encode($smtp_pass), 235);
if (!$result['success']) {
    fclose($socket);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Password failed - Check SMTP credentials!']);
    exit();
}

// Send email
$result = smtp_cmd($socket, "MAIL FROM:<$smtp_from>", 250);
$result = smtp_cmd($socket, "RCPT TO:<$to>", 250);
$result = smtp_cmd($socket, "DATA", 354);

fwrite($socket, "Subject: $subject\r\n");
fwrite($socket, $headers . "\r\n");
fwrite($socket, $body . "\r\n");
fwrite($socket, ".\r\n");

$response = fgets($socket, 512);
$code = substr($response, 0, 3);

smtp_cmd($socket, "QUIT", 221);
fclose($socket);

// Log
$logDir = __DIR__ . '/logs';
if (!is_dir($logDir)) @mkdir($logDir, 0755, true);
$timestamp = date('Y-m-d H:i:s');

if ($code == 250) {
    $logEntry = "[$timestamp] ✅ SMTP SUCCESS - $to ($code - $fullName)\n";
    @file_put_contents($logDir . '/smtp-emails.log', $logEntry, FILE_APPEND);
    
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Email sent via SMTP',
        'recipient' => $to,
        'code' => $code
    ]);
} else {
    $logEntry = "[$timestamp] ❌ SMTP FAILED - $to ($response)\n";
    @file_put_contents($logDir . '/smtp-emails.log', $logEntry, FILE_APPEND);
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'SMTP delivery failed: ' . $response
    ]);
}
?>

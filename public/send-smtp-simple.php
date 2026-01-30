<?php
/**
 * Send Ambassador Credentials via iPage SMTP using PHPMailer
 * Download PHPMailer from: https://github.com/PHPMailer/PHPMailer
 * Or use: composer require phpmailer/phpmailer
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

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

// iPage SMTP Settings
$smtp_host = 'smtp.ipage.com';
$smtp_port = 587;
$smtp_user = 'orders@marriageducation.com';
$smtp_pass = 'Fi5%%%orderBTH123';
$from_email = 'orders@marriageducation.com';
$from_name = 'Marriage Education';

// Email content
$subject = "Welcome Ambassador $code - Your Credentials Inside";

$html = <<<HTML
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;line-height:1.6;color:#2d3436;margin:0;padding:0}.container{max-width:600px;margin:0 auto}.header{background:linear-gradient(135deg,#00b894 0%,#00a085 100%);color:white;padding:30px;text-align:center;border-radius:10px 10px 0 0}.content{background:#f8f9fa;padding:30px;border-radius:0 0 10px 10px}.box{background:white;padding:20px;border-radius:8px;margin:20px 0;border:2px solid #00b894}.code{font-family:monospace;font-size:20px;color:#00b894;font-weight:bold}.button{display:inline-block;background:#00b894;color:white;padding:12px 30px;text-decoration:none;border-radius:5px}.footer{text-align:center;padding:20px;color:#636e72;font-size:14px}</style>
</head>
<body>
<div class="container">
<div class="header"><h1>Welcome, Ambassador $fullName!</h1></div>
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
<div class="footer"><p>Marriage Education | marriageducation.com</p></div>
</div>
</body>
</html>
HTML;

$plainText = "Welcome, Ambassador $fullName!\n\nAmbassador Code: $code\nEmail: $to\nDashboard: https://marriageducation.com/ambassador-login.html\n\nBook Download: $bookUrl\nExpires: $expiryDate";

// Create message
$boundary = md5(time());

$headers = array(
    "From: $from_name <$from_email>",
    "Reply-To: $from_email",
    "MIME-Version: 1.0",
    "Content-Type: multipart/alternative; boundary=\"$boundary\""
);

$body = "--$boundary\r\n";
$body .= "Content-Type: text/plain; charset=UTF-8\r\n\r\n";
$body .= $plainText . "\r\n\r\n";
$body .= "--$boundary\r\n";
$body .= "Content-Type: text/html; charset=UTF-8\r\n\r\n";
$body .= $html . "\r\n\r\n";
$body .= "--$boundary--";

// Use ini_set to configure SMTP
ini_set('SMTP', $smtp_host);
ini_set('smtp_port', $smtp_port);
ini_set('sendmail_from', $from_email);

// Try mail() with proper headers
$result = mail($to, $subject, $body, implode("\r\n", $headers), "-f$from_email");

// Log
$logDir = __DIR__ . '/logs';
if (!is_dir($logDir)) @mkdir($logDir, 0755, true);
$timestamp = date('Y-m-d H:i:s');

if ($result) {
    $logEntry = "[$timestamp] ✅ SENT - $to ($fullName - $code)\n";
    @file_put_contents($logDir . '/smtp-emails.log', $logEntry, FILE_APPEND);
    
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Email sent via iPage SMTP',
        'recipient' => $to,
        'code' => $code,
        'note' => 'Check inbox and spam folder'
    ]);
} else {
    $logEntry = "[$timestamp] ❌ FAILED - $to ($fullName - $code)\n";
    @file_put_contents($logDir . '/smtp-emails.log', $logEntry, FILE_APPEND);
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Mail function returned false',
        'smtp_config' => [
            'host' => $smtp_host,
            'port' => $smtp_port,
            'from' => $from_email
        ]
    ]);
}
?>

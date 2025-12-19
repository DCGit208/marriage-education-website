<?php
/**
 * Simple Email Test for iPage
 * Tests if PHP mail() function works and emails reach ambassadors@marriageducation.com
 */

// Set error reporting
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Email configuration
$to = 'ambassadors@marriageducation.com';
$subject = '🧪 Test Email from Marriage Education - ' . date('Y-m-d H:i:s');
$from = 'noreply@marriageducation.com';

// Simple HTML message
$message = "
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px; border-radius: 10px; }
        .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .info { background: #d1ecf1; color: #0c5460; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class='container'>
        <h1>🧪 Email Test</h1>
        <div class='success'>
            <strong>✅ This is a test email from your Marriage Education website</strong>
        </div>
        <div class='info'>
            <p><strong>Test Details:</strong></p>
            <ul>
                <li><strong>Recipient:</strong> $to</li>
                <li><strong>Sender:</strong> $from</li>
                <li><strong>Date/Time:</strong> " . date('Y-m-d H:i:s') . "</li>
                <li><strong>Server:</strong> " . $_SERVER['SERVER_NAME'] . "</li>
                <li><strong>PHP Version:</strong> " . phpversion() . "</li>
            </ul>
            <p>If you received this email, your email configuration is working correctly!</p>
        </div>
        <p><strong>Next Steps:</strong></p>
        <ol>
            <li>Check if this email arrived in your inbox</li>
            <li>Check your spam folder if not in inbox</li>
            <li>Add ambassadors@marriageducation.com to your safe senders list</li>
            <li>Test the ambassador registration form</li>
        </ol>
    </div>
</body>
</html>
";

// Email headers
$headers = [];
$headers[] = "MIME-Version: 1.0";
$headers[] = "Content-Type: text/html; charset=UTF-8";
$headers[] = "From: Marriage Education <$from>";
$headers[] = "Reply-To: $from";
$headers[] = "X-Mailer: PHP/" . phpversion();

// Send email
echo "<!DOCTYPE html>
<html>
<head>
    <title>Email Test Results</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .error { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .info { background: #d1ecf1; color: #0c5460; padding: 15px; border-radius: 5px; margin: 20px 0; }
        pre { background: #f8f9fa; padding: 10px; border-radius: 5px; overflow-x: auto; }
        h1 { color: #00b894; }
    </style>
</head>
<body>
    <div class='container'>
        <h1>🧪 Email Test Results</h1>";

echo "<div class='info'>";
echo "<strong>Testing email configuration...</strong><br><br>";
echo "<strong>To:</strong> $to<br>";
echo "<strong>From:</strong> $from<br>";
echo "<strong>Subject:</strong> $subject<br>";
echo "<strong>Server:</strong> " . $_SERVER['SERVER_NAME'] . "<br>";
echo "<strong>PHP Version:</strong> " . phpversion() . "<br>";
echo "</div>";

$mailSent = @mail($to, $subject, $message, implode("\r\n", $headers));

if ($mailSent) {
    echo "<div class='success'>";
    echo "<h2>✅ Email Sent Successfully!</h2>";
    echo "<p><strong>The PHP mail() function executed successfully.</strong></p>";
    echo "<p>Now check your email at <strong>ambassadors@marriageducation.com</strong></p>";
    echo "<p><strong>Important:</strong></p>";
    echo "<ul>";
    echo "<li>Check your inbox (may take 1-5 minutes to arrive)</li>";
    echo "<li>Check your spam/junk folder</li>";
    echo "<li>Add ambassadors@marriageducation.com to your safe senders</li>";
    echo "<li>If using Gmail, check the Promotions or Updates tab</li>";
    echo "</ul>";
    echo "</div>";
    
    // Log success
    $log = date('Y-m-d H:i:s') . " - Test email sent successfully to $to\n";
    @file_put_contents('logs/email-test.log', $log, FILE_APPEND);
    
} else {
    echo "<div class='error'>";
    echo "<h2>❌ Email Failed to Send</h2>";
    echo "<p><strong>The PHP mail() function returned FALSE</strong></p>";
    
    $lastError = error_get_last();
    if ($lastError) {
        echo "<p><strong>Last PHP Error:</strong></p>";
        echo "<pre>" . print_r($lastError, true) . "</pre>";
    }
    
    echo "<p><strong>Possible Issues:</strong></p>";
    echo "<ol>";
    echo "<li><strong>Mail function disabled:</strong> Check with iPage if PHP mail() is enabled</li>";
    echo "<li><strong>Sender email invalid:</strong> The 'From' address must be from your domain</li>";
    echo "<li><strong>SMTP not configured:</strong> iPage might require SMTP configuration</li>";
    echo "<li><strong>Server permissions:</strong> Check file/folder permissions</li>";
    echo "</ol>";
    
    echo "<p><strong>Alternative Solutions:</strong></p>";
    echo "<ul>";
    echo "<li>Use SMTP instead of mail() function</li>";
    echo "<li>Configure email forwarding in iPage cPanel</li>";
    echo "<li>Use PHPMailer library with SMTP</li>";
    echo "<li>Contact iPage support for email configuration help</li>";
    echo "</ul>";
    echo "</div>";
    
    // Log failure
    $log = date('Y-m-d H:i:s') . " - Test email FAILED to $to\n";
    $log .= "Error: " . ($lastError ? $lastError['message'] : 'Unknown') . "\n";
    @file_put_contents('logs/email-test.log', $log, FILE_APPEND);
}

echo "
        <div class='info'>
            <h3>📋 Server Information</h3>
            <pre>";
echo "PHP Version: " . phpversion() . "\n";
echo "Server Software: " . $_SERVER['SERVER_SOFTWARE'] . "\n";
echo "Server Name: " . $_SERVER['SERVER_NAME'] . "\n";
echo "Document Root: " . $_SERVER['DOCUMENT_ROOT'] . "\n";
echo "Mail Function Available: " . (function_exists('mail') ? 'YES' : 'NO') . "\n";
echo "</pre>
        </div>
        
        <div style='text-align: center; margin-top: 30px;'>
            <a href='test-email-simple.php' style='background: #00b894; color: white; padding: 12px 24px; border-radius: 5px; text-decoration: none; display: inline-block;'>
                🔄 Run Test Again
            </a>
            <a href='ambassador-register.html' style='background: #636e72; color: white; padding: 12px 24px; border-radius: 5px; text-decoration: none; display: inline-block; margin-left: 10px;'>
                Back to Registration
            </a>
        </div>
    </div>
</body>
</html>";
?>

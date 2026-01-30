<?php
// Simple test to check if PHP mail() works on iPage server
$to = 'bthedugrp@gmail.com';
$subject = 'Test Email from iPage Server';
$message = 'This is a test email to verify PHP mail() function works.';
$headers = "From: orders@marriageducation.com\r\n";
$headers .= "Reply-To: orders@marriageducation.com\r\n";

$result = mail($to, $subject, $message, $headers);

if ($result) {
    echo "✅ mail() returned TRUE - but this doesn't guarantee delivery\n";
    echo "Check inbox at: $to\n";
} else {
    echo "❌ mail() returned FALSE - PHP mail is not working\n";
}

// Check if mail is configured
echo "\n--- PHP Mail Configuration ---\n";
echo "sendmail_path: " . ini_get('sendmail_path') . "\n";
echo "SMTP: " . ini_get('SMTP') . "\n";
echo "smtp_port: " . ini_get('smtp_port') . "\n";
?>

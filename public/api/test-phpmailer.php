<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "Starting PHPMailer test...\n";

try {
    require_once 'PHPMailer/src/Exception.php';
    echo "✓ Exception.php loaded\n";
    
    require_once 'PHPMailer/src/PHPMailer.php';
    echo "✓ PHPMailer.php loaded\n";
    
    require_once 'PHPMailer/src/SMTP.php';
    echo "✓ SMTP.php loaded\n";
    
    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    echo "✓ PHPMailer object created\n";
    
    $mail->isSMTP();
    $mail->Host = 'smtp.ipage.com';
    $mail->SMTPAuth = true;
    $mail->Username = 'orders@marriageducation.com';
    $mail->Password = 'Fi5%%%orderBTH123';
    $mail->SMTPSecure = 'tls';
    $mail->Port = 587;
    
    echo "✓ SMTP configured\n";
    
    $mail->setFrom('orders@marriageducation.com', 'Test');
    $mail->addAddress('sbdpursuit@gmail.com');
    $mail->Subject = 'PHPMailer Test';
    $mail->Body = 'This is a test';
    
    echo "✓ Email composed\n";
    
    $mail->send();
    echo "✓ EMAIL SENT!\n";
    
} catch (Exception $e) {
    echo "❌ ERROR: " . $e->getMessage() . "\n";
    echo "Stack trace: " . $e->getTraceAsString() . "\n";
}
?>

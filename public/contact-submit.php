<?php
declare(strict_types=1);

function redirectToContact(string $status): never
{
    header('Location: /contact.html?status=' . rawurlencode($status) . '#contact-form', true, 303);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    exit('Method not allowed');
}

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 20000) {
    redirectToContact('too_large');
}

$subjects = [
    'General Inquiry',
    'Course Information',
    'Book Orders',
    'Coaching Inquiry',
    'Technical Support',
    'Partnership/Media',
    'Free Guide Request',
];

$name = $_POST['name'] ?? null;
$email = $_POST['email'] ?? null;
$subject = $_POST['subject'] ?? null;
$message = $_POST['message'] ?? null;
$honeypot = $_POST['website'] ?? '';

if (
    !is_string($name)
    || !is_string($email)
    || !is_string($subject)
    || !is_string($message)
    || !is_string($honeypot)
    || $honeypot !== ''
) {
    redirectToContact('invalid');
}

$name = trim(preg_replace('/[\r\n\t]+/u', ' ', $name) ?? '');
$email = trim($email);
$message = trim($message);

if (
    $name === ''
    || strlen($name) > 120
    || !filter_var($email, FILTER_VALIDATE_EMAIL)
    || strlen($email) > 254
    || !in_array($subject, $subjects, true)
    || $message === ''
    || strlen($message) > 12000
) {
    redirectToContact('invalid');
}

if (!session_start()) {
    error_log('Contact form could not start a session for rate limiting.');
    redirectToContact('unavailable');
}

$now = time();
$lastSubmission = (int) ($_SESSION['contact_form_last_submission'] ?? 0);
if ($now - $lastSubmission < 60) {
    redirectToContact('rate_limited');
}

$recipient = 'info@marriageducation.com';
$body = "Name: {$name}\nEmail: {$email}\nSubject: {$subject}\n\nMessage:\n{$message}\n";
$headers = [
    'Reply-To: ' . $email,
    'Content-Type: text/plain; charset=UTF-8',
];

// Primary: relay through the Cloud Function (Resend first, SMTP fallback there).
function sendViaRelay(array $payload): bool
{
    if (!function_exists('curl_init')) {
        return false;
    }
    $ch = curl_init('https://us-central1-marriage-education.cloudfunctions.net/sendContactMessage');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
    ]);
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $response !== false && $status === 200;
}

$delivered = sendViaRelay([
    'name' => $name,
    'email' => $email,
    'subject' => $subject,
    'message' => $message,
]);

// Fallback: this server's own mail().
if (!$delivered) {
    error_log('Contact form relay failed; falling back to mail().');
    $delivered = mail($recipient, '[Marriage Education contact] ' . $subject, $body, implode("\r\n", $headers));
}

if (!$delivered) {
    error_log('Contact form delivery failed on relay and mail().');
    redirectToContact('unavailable');
}

$_SESSION['contact_form_last_submission'] = $now;
redirectToContact('sent');

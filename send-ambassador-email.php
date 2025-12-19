<?php
/**
 * Ambassador Registration Email Handler
 * Sends registration notifications to ambassadors@marriageducation.com
 */

// Set headers for JSON response
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

// Get POST data
$json = file_get_contents('php://input');
$data = json_decode($json, true);

// Validate required fields
$required = ['fullName', 'email', 'phone', 'city', 'region', 'motivation', 'commitment'];
foreach ($required as $field) {
    if (empty($data[$field])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => "Missing required field: $field"]);
        exit();
    }
}

// Sanitize inputs
$fullName = htmlspecialchars($data['fullName']);
$email = filter_var($data['email'], FILTER_SANITIZE_EMAIL);
$phone = htmlspecialchars($data['phone']);
$city = htmlspecialchars($data['city']);
$region = htmlspecialchars($data['region']);
$motivation = htmlspecialchars($data['motivation']);
$commitment = htmlspecialchars($data['commitment']);
$primaryPlatform = htmlspecialchars($data['primaryPlatform'] ?? 'Not specified');
$salesExperience = htmlspecialchars($data['salesExperience'] ?? 'Not specified');
$referralSource = htmlspecialchars($data['referralSource'] ?? 'Not specified');

// Social media details
$instagram = htmlspecialchars($data['instagram'] ?? '');
$instagramFollowers = htmlspecialchars($data['instagramFollowers'] ?? '0');
$facebook = htmlspecialchars($data['facebook'] ?? '');
$facebookFollowers = htmlspecialchars($data['facebookFollowers'] ?? '0');
$tiktok = htmlspecialchars($data['tiktok'] ?? '');
$linkedin = htmlspecialchars($data['linkedin'] ?? '');

// Email configuration
$to = 'ambassadors@marriageducation.com';
$subject = "🎯 New Ambassador Application - $fullName";
$from = 'noreply@marriageducation.com';

// Build HTML email
$emailBody = "
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #00b894 0%, #00a085 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { background: #f9f9f9; padding: 30px; border: 1px solid #e0e0e0; }
        .section { background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; border-left: 4px solid #00b894; }
        .section h2 { color: #00b894; margin-top: 0; font-size: 18px; }
        .field { margin-bottom: 12px; }
        .field strong { display: inline-block; width: 180px; color: #555; }
        .field-value { color: #333; }
        .motivation-box { background: #fffbf0; padding: 15px; border-left: 3px solid #f39c12; border-radius: 4px; margin-top: 10px; }
        .footer { background: #2d3436; color: white; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }
        .badge { display: inline-block; background: #00b894; color: white; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: bold; }
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>🎯 New Ambassador Application</h1>
            <p style='margin: 5px 0 0 0;'>Sex By Design Campaign</p>
        </div>
        
        <div class='content'>
            <div class='section'>
                <h2>👤 Personal Information</h2>
                <div class='field'><strong>Full Name:</strong> <span class='field-value'>$fullName</span></div>
                <div class='field'><strong>Email:</strong> <span class='field-value'><a href='mailto:$email'>$email</a></span></div>
                <div class='field'><strong>Phone/WhatsApp:</strong> <span class='field-value'>$phone</span></div>
                <div class='field'><strong>Location:</strong> <span class='field-value'>$city, $region</span></div>
            </div>
            
            <div class='section'>
                <h2>📱 Social Media Presence</h2>
                <div class='field'><strong>Primary Platform:</strong> <span class='badge'>$primaryPlatform</span></div>
                " . ($instagram ? "<div class='field'><strong>Instagram:</strong> <span class='field-value'>@$instagram ($instagramFollowers followers)</span></div>" : "") . "
                " . ($facebook ? "<div class='field'><strong>Facebook:</strong> <span class='field-value'>$facebook ($facebookFollowers friends/followers)</span></div>" : "") . "
                " . ($tiktok ? "<div class='field'><strong>TikTok:</strong> <span class='field-value'>@$tiktok</span></div>" : "") . "
                " . ($linkedin ? "<div class='field'><strong>LinkedIn:</strong> <span class='field-value'>$linkedin</span></div>" : "") . "
            </div>
            
            <div class='section'>
                <h2>🎯 Commitment & Experience</h2>
                <div class='field'><strong>Target Commitment:</strong> <span class='field-value'><strong>$commitment books</strong></span></div>
                <div class='field'><strong>Sales Experience:</strong> <span class='field-value'>$salesExperience</span></div>
                <div class='field'><strong>Referral Source:</strong> <span class='field-value'>$referralSource</span></div>
            </div>
            
            <div class='section'>
                <h2>💡 Motivation</h2>
                <div class='motivation-box'>
                    $motivation
                </div>
            </div>
            
            <div class='section' style='background: #e8f8f5; border-left-color: #00b894;'>
                <h2>⚡ Next Steps</h2>
                <p style='margin: 0;'>
                    ✅ Review application<br>
                    ✅ Approve/Reject within 24-48 hours<br>
                    ✅ Send welcome email with ambassador code<br>
                    ✅ Grant access to dashboard and resources
                </p>
            </div>
        </div>
        
        <div class='footer'>
            <p><strong>Marriage Education Ambassador Program</strong></p>
            <p>This is an automated notification from the ambassador registration system.</p>
            <p style='margin-top: 10px;'>📧 ambassadors@marriageducation.com | 📱 +237 XXX XXX XXX</p>
        </div>
    </div>
</body>
</html>
";

// Plain text version for email clients that don't support HTML
$textBody = "NEW AMBASSADOR APPLICATION\n\n";
$textBody .= "PERSONAL INFORMATION\n";
$textBody .= "Name: $fullName\n";
$textBody .= "Email: $email\n";
$textBody .= "Phone: $phone\n";
$textBody .= "Location: $city, $region\n\n";
$textBody .= "SOCIAL MEDIA\n";
$textBody .= "Primary Platform: $primaryPlatform\n";
if ($instagram) $textBody .= "Instagram: @$instagram ($instagramFollowers followers)\n";
if ($facebook) $textBody .= "Facebook: $facebook ($facebookFollowers friends)\n";
if ($tiktok) $textBody .= "TikTok: @$tiktok\n";
if ($linkedin) $textBody .= "LinkedIn: $linkedin\n";
$textBody .= "\nCOMMITMENT\n";
$textBody .= "Target: $commitment books\n";
$textBody .= "Sales Experience: $salesExperience\n";
$textBody .= "Referral Source: $referralSource\n\n";
$textBody .= "MOTIVATION\n$motivation\n\n";
$textBody .= "---\nThis is an automated notification from Marriage Education Ambassador Program";

// Email headers
$headers = [];
$headers[] = "MIME-Version: 1.0";
$headers[] = "Content-Type: text/html; charset=UTF-8";
$headers[] = "From: Marriage Education <$from>";
$headers[] = "Reply-To: $email";
$headers[] = "X-Mailer: PHP/" . phpversion();
$headers[] = "X-Priority: 1"; // High priority

// Log email attempt
$logEntry = date('Y-m-d H:i:s') . " - Attempting to send email\n";
$logEntry .= "To: $to\n";
$logEntry .= "From: $from\n";
$logEntry .= "Subject: $subject\n";
$logEntry .= "Applicant: $fullName ($email)\n";
$logEntry .= "---\n";
@file_put_contents('logs/email-attempts.log', $logEntry, FILE_APPEND);

// Send email using PHP mail() function (iPage supports this)
$mailSent = mail($to, $subject, $emailBody, implode("\r\n", $headers));

if ($mailSent) {
    // Log successful submission
    $logEntry = date('Y-m-d H:i:s') . " - ✅ SUCCESS - Email sent to $to\n";
    $logEntry .= "Ambassador application: $fullName ($email)\n";
    $logEntry .= "Phone: $phone | Location: $city, $region\n";
    $logEntry .= "---\n";
    @file_put_contents('logs/ambassador-submissions.log', $logEntry, FILE_APPEND);
    
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Application submitted successfully',
        'emailSent' => true,
        'recipient' => $to,
        'timestamp' => date('Y-m-d H:i:s')
    ]);
} else {
    // Log failure
    $errorLog = date('Y-m-d H:i:s') . " - ❌ FAILED - Email to $to failed\n";
    $errorLog .= "PHP mail() returned false\n";
    $errorLog .= "Applicant: $fullName ($email)\n";
    $errorLog .= "Error: " . error_get_last()['message'] ?? 'Unknown error' . "\n";
    $errorLog .= "---\n";
    @file_put_contents('logs/email-errors.log', $errorLog, FILE_APPEND);
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to send email notification. The mail() function returned false.',
        'emailSent' => false,
        'recipient' => $to,
        'debug' => error_get_last()
    ]);
}
?>

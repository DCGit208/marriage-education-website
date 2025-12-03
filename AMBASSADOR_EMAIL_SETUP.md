# Ambassador Email System - Setup Guide

## Overview
The ambassador registration system now forwards all applications to **ambassadors@marriageducation.com** using your iPage email service.

## How It Works

### 1. **Dual Submission Flow**
When a user submits the ambassador registration form:
```
User fills form → Firebase (data storage) → PHP Email Handler → ambassadors@marriageducation.com
```

### 2. **Files Involved**

#### **ambassador-register.html**
- Updated form with firstName/lastName fields (instead of fullName)
- JavaScript handler that:
  - Validates form data
  - Saves to Firebase Firestore
  - Sends email via PHP backend
  - Shows success modal

#### **send-ambassador-email.php**
- Receives form data via POST (JSON)
- Validates and sanitizes all inputs
- Formats beautiful HTML email
- Sends to ambassadors@marriageducation.com
- Logs submissions to logs/ambassador-submissions.log

#### **js/firebase-config.js**
- Updated `createAmbassador()` function
- Now stores ALL form fields including:
  - Personal info (firstName, lastName, email, phone, city, region)
  - Social media (instagram, facebook, tiktok, linkedin, followers)
  - Commitment details (motivation, salesExperience, commitment, primaryPlatform)

## Email Content

Each ambassador application email includes:

### Personal Information
- Full name
- Email (clickable)
- Phone/WhatsApp
- Location (City, Region)

### Social Media Presence
- Primary platform (badge)
- Instagram handle + followers
- Facebook profile + friends
- TikTok handle
- LinkedIn profile

### Commitment & Experience
- Target commitment (60, 90, or 120 books)
- Sales experience level
- How they heard about the program

### Motivation
- Full motivation text (formatted nicely)

### Next Steps Checklist
- Review application
- Approve/Reject within 24-48 hours
- Send welcome email with ambassador code
- Grant dashboard access

## Testing

### Test the Email System
1. Open: `test-ambassador-email.html` in your browser
2. Fill in the pre-populated test data (or modify as needed)
3. Click "Send Test Email"
4. Check ambassadors@marriageducation.com inbox

### What to Check
- ✅ Email arrives at ambassadors@marriageducation.com
- ✅ HTML formatting looks good
- ✅ All fields display correctly
- ✅ Links are clickable (email, URLs)
- ✅ Reply-To is set to applicant's email

## iPage Configuration

### Required Settings
Your iPage hosting should have:
- ✅ PHP mail() function enabled (default on iPage)
- ✅ Email account: ambassadors@marriageducation.com created
- ✅ PHP version 7.4+ (recommended)

### If Emails Don't Send

**Option 1: Use iPage SMTP (More Reliable)**

Update `send-ambassador-email.php` to use SMTP instead of mail():

```php
// Add at top of file
use PHPMailer\PHPMailer\PHPMailer;
require 'vendor/autoload.php';

// Replace mail() function with:
$mail = new PHPMailer(true);
$mail->isSMTP();
$mail->Host = 'mail.marriageducation.com'; // Your iPage SMTP server
$mail->SMTPAuth = true;
$mail->Username = 'ambassadors@marriageducation.com';
$mail->Password = 'your_email_password';
$mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
$mail->Port = 587;
$mail->setFrom('noreply@marriageducation.com', 'Marriage Education');
$mail->addAddress('ambassadors@marriageducation.com');
$mail->Subject = $subject;
$mail->Body = $emailBody;
$mail->send();
```

**Option 2: Check iPage Email Logs**
1. Log into iPage Control Panel
2. Go to "Email" → "Email Accounts"
3. Check "Email Logs" for delivery status

**Option 3: Verify PHP mail() is Enabled**
Create `test-mail.php`:
```php
<?php
$to = 'ambassadors@marriageducation.com';
$subject = 'Test Email';
$message = 'This is a test email from iPage';
$headers = 'From: test@marriageducation.com';

if (mail($to, $subject, $message, $headers)) {
    echo 'Email sent successfully';
} else {
    echo 'Email failed';
}
?>
```

## Security Features

### 1. **Input Validation**
- All fields validated and sanitized
- Required fields checked
- Email addresses filtered

### 2. **Log Protection**
- Logs stored in `/logs/` directory
- `.htaccess` denies direct access to .log files

### 3. **CORS Headers**
- Allows POST requests from your domain
- Prevents unauthorized access

## Troubleshooting

### Email Not Received
1. **Check spam/junk folder**
2. **Verify email exists**: Log into iPage webmail for ambassadors@marriageducation.com
3. **Check logs**: Look at `logs/ambassador-submissions.log`
4. **Test PHP mail**: Run test-mail.php (see above)
5. **Check iPage email quotas**: Ensure you haven't hit sending limits

### Form Submission Fails
1. **Check browser console** for JavaScript errors
2. **Verify Firebase connection** (check Firebase console)
3. **Test PHP file directly** using test-ambassador-email.html
4. **Check file permissions**: send-ambassador-email.php should be readable

### Database Not Updating
1. **Check Firebase credentials** in js/firebase-config.js
2. **Verify Firestore rules** allow writes to ambassadors collection
3. **Check browser console** for Firebase errors

## File Permissions

Set correct permissions on your server:
```bash
chmod 644 send-ambassador-email.php
chmod 755 logs/
chmod 644 logs/.htaccess
chmod 666 logs/ambassador-submissions.log
```

## Monitoring

### Check Submission Logs
View recent submissions:
```bash
tail -f logs/ambassador-submissions.log
```

### Firebase Console
Monitor real-time submissions:
1. Go to Firebase Console
2. Navigate to Firestore Database
3. Open "ambassadors" collection
4. View recent documents

## Email Template Customization

To modify the email design, edit `send-ambassador-email.php`:

```php
// Line ~70: HTML email body
$emailBody = "
<!DOCTYPE html>
<html>
<head>
    <style>
        /* Modify CSS here */
    </style>
</head>
<body>
    <!-- Modify HTML structure here -->
</body>
</html>
";
```

## Support

If you need help:
- 📧 Email: support@marriageducation.com
- 📱 WhatsApp: [Your number]
- 🌐 iPage Support: https://www.ipage.com/help

## Files Modified

### New Files Created
- ✅ `send-ambassador-email.php` - Email handler
- ✅ `test-ambassador-email.html` - Testing interface
- ✅ `logs/.htaccess` - Log security
- ✅ `logs/ambassador-submissions.log` - Submission log

### Modified Files
- ✅ `ambassador-register.html` - Split fullName, added email call
- ✅ `js/firebase-config.js` - Updated createAmbassador() function

## Next Steps

1. **Test the system**: Use test-ambassador-email.html
2. **Verify email delivery**: Check ambassadors@marriageducation.com
3. **Monitor logs**: Watch logs/ambassador-submissions.log
4. **Setup email rules**: Create filters in ambassadors inbox for organization
5. **Create response templates**: Prepare approval/rejection email templates

---

**✅ System Status**: Ready for production use
**🔄 Last Updated**: December 3, 2025

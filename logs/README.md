# Email Logs Directory

This directory contains logs for email delivery tracking.

## Log Files

### email-attempts.log
Records every attempt to send an email, including:
- Timestamp
- Recipient address
- Sender address
- Subject line
- Applicant details

### email-errors.log
Records failed email attempts with:
- Error messages
- PHP errors
- Applicant information
- Troubleshooting data

### ambassador-submissions.log
Records successful ambassador registrations:
- Application timestamp
- Applicant full name
- Email and phone
- Location

### email-test.log
Records test email attempts from test-email-simple.php

## How to View Logs

### Via FTP:
1. Connect to your iPage FTP
2. Navigate to `/logs/` directory
3. Download log files to view

### Via cPanel File Manager:
1. Login to iPage cPanel
2. Open File Manager
3. Navigate to `/logs/` folder
4. Right-click files → View or Edit

### Via SSH (if enabled):
```bash
cd /path/to/marriageducation/logs
tail -f email-attempts.log
```

## Log Format Example

```
2024-12-19 10:30:15 - Attempting to send email
To: ambassadors@marriageducation.com
From: noreply@marriageducation.com
Subject: 🎯 New Ambassador Application - John Doe
Applicant: John Doe (john@example.com)
---
2024-12-19 10:30:16 - ✅ SUCCESS - Email sent to ambassadors@marriageducation.com
Ambassador application: John Doe (john@example.com)
Phone: +237 600 000 000 | Location: Douala, Littoral
---
```

## Troubleshooting

If logs are empty or not being created:
- Check folder permissions: `chmod 755 logs`
- Check PHP write permissions
- Verify the logs directory exists
- Check server error logs

## Privacy Notice

These logs may contain personal information. Protect them appropriately:
- Don't share publicly
- Delete old logs periodically
- Keep directory permissions restricted
- Consider adding to .gitignore

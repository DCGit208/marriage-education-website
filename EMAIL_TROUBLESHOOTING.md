# Email Troubleshooting Guide - Ambassador Registration

## 🔍 The Issue
✅ Form submits successfully  
✅ Success modal appears  
❌ **No emails received at ambassadors@marriageducation.com**

## ✅ Quick Answer
**YES, the email IS being sent to ambassadors@marriageducation.com** - I verified the code:
```php
$to = 'ambassadors@marriageducation.com';  // Line 61 in send-ambassador-email.php
```

## 🎯 Most Likely Causes

### 1. Email Account Doesn't Exist (MOST COMMON)
- The email `ambassadors@marriageducation.com` must be created in iPage cPanel
- **Action:** Create this email account in cPanel → Email Accounts

### 2. PHP mail() Not Working on iPage
- iPage may require SMTP instead of basic mail() function
- **Action:** Run the test at `test-email-simple.php` to verify

### 3. Emails Going to Spam
- Missing SPF/DKIM records can cause this
- **Action:** Check spam folder, add to safe senders

### 4. Sender Email Not Configured
- The FROM email `noreply@marriageducation.com` must also exist
- **Action:** Create this email in cPanel

## 🧪 Testing Steps

### Step 1: Run Simple Email Test
1. Upload files to iPage
2. Visit: `https://marriageducation.com/test-email-simple.php`
3. Check if you receive the test email
4. Check spam folder if not in inbox

### Step 2: Check the Logs
After running the test or a real submission, check these files via FTP:
- `logs/email-attempts.log` - Shows all attempts
- `logs/email-errors.log` - Shows failures
- `logs/ambassador-submissions.log` - Shows successes

### Step 3: Verify Email Configuration
Log into iPage cPanel:
1. Go to **Email Accounts**
2. Verify these accounts exist:
   - ✅ `ambassadors@marriageducation.com`
   - ✅ `noreply@marriageducation.com`
3. Check storage quota (must have space)
4. Check for email forwarding rules

### Step 4: Check Your Inbox
Look in all these places:
- [ ] Webmail at `webmail.marriageducation.com`
- [ ] Your regular email client
- [ ] Spam/Junk folder
- [ ] Gmail: Promotions or Updates tab
- [ ] Outlook: Clutter or Junk folder

## 📧 How to Access Your Email

### Option 1: Webmail (Recommended for Testing)
```
URL: https://webmail.marriageducation.com
Username: ambassadors@marriageducation.com
Password: [Your password from cPanel]
```

### Option 2: Forward to Your Personal Email
In iPage cPanel:
1. Email Accounts → Forwarders
2. Forward `ambassadors@marriageducation.com` to your Gmail/personal email
3. Test again

## 🔧 If Email Still Doesn't Work

### Check with iPage Support
Call iPage and ask these specific questions:
1. "Is the PHP mail() function enabled on my hosting account?"
2. "Do I need to use SMTP authentication for sending emails?"
3. "Are there any restrictions on email sending from PHP scripts?"
4. "Can you check if any emails are being blocked from my account?"

### Switch to SMTP (If mail() Doesn't Work)
If iPage requires SMTP, you'll need to:
1. Use PHPMailer library
2. Configure SMTP settings:
   - Host: `mail.marriageducation.com`
   - Port: `587` (TLS)
   - Username: `noreply@marriageducation.com`
   - Password: Your email password

I can help set this up if needed!

## 📊 Browser Console Verification

When you submit the form, open browser console (F12) and look for:

### Success Pattern:
```
📝 Starting submission...
🔥 Saving to Firebase...
✅ Saved to Firebase: AMB-TEST-1234
📧 Sending email to ambassadors@marriageducation.com...
✅ Email sent successfully to: ambassadors@marriageducation.com
📧 Email details: {success: true, recipient: "ambassadors@marriageducation.com", ...}
```

### If You See This - Email Was Sent Successfully!
The PHP script executed without errors. The issue is likely:
- Email account doesn't exist
- Emails in spam
- Email forwarding misconfigured

### Failure Pattern:
```
❌ Email failed: {success: false, error: "..."}
```
This means the PHP mail() function failed. Check the error message!

## 🎯 What I Changed

### Enhanced Logging
The updated code now logs:
- ✅ Every email attempt (even failures)
- ✅ Exact recipient address in response
- ✅ Detailed error messages
- ✅ Timestamp and applicant details

### Files Updated:
1. `send-ambassador-email.php` - Added detailed logging
2. `ambassador-register.html` - Shows recipient in console
3. `test-email-simple.php` - Simple email tester (NEW)
4. `email-diagnostic.html` - Full diagnostic page (NEW)

### Logs Created:
- `logs/email-attempts.log`
- `logs/email-errors.log`
- `logs/ambassador-submissions.log`
- `logs/email-test.log`

## 📁 Files to Upload to iPage

Upload these files to your web root:
```
ambassador-register.html (updated)
send-ambassador-email.php (updated)
test-email-simple.php (new)
email-diagnostic.html (new)
logs/ (directory - create it)
```

## 🚀 Action Plan

1. **Upload updated files to iPage** ✅ Do this first
2. **Create email accounts in cPanel** (if they don't exist)
3. **Run test:** Visit `test-email-simple.php`
4. **Check webmail:** Visit `webmail.marriageducation.com`
5. **Test registration:** Fill out the form, check console
6. **Check logs:** via FTP or File Manager
7. **Contact iPage support** if still not working

## 💡 Quick Win

The fastest way to test:
1. Log into iPage cPanel
2. Go to Email Accounts
3. Create `ambassadors@marriageducation.com` (if it doesn't exist)
4. Set up forwarding to your personal Gmail
5. Run test again
6. Check your Gmail (including spam)

This will tell you immediately if emails are being sent!

## 📞 Need Help?

If after all this it still doesn't work:
1. Share the output from `test-email-simple.php`
2. Share any error logs from `logs/` folder
3. Let me know what iPage support says

I can then help you set up SMTP as an alternative!

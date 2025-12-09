# Email Deliverability - DNS Records Setup

## 🎯 Goal
Improve email deliverability and prevent your emails from going to spam/promotions folder by adding proper email authentication records to your domain DNS.

## 📋 DNS Records to Add

### 1. SPF Record (Sender Policy Framework)
**Prevents email spoofing and improves deliverability**

```
Type: TXT
Host/Name: @
Value: v=spf1 include:ipage.com ~all
TTL: 3600 (or default)
```

**What this does:** Tells receiving email servers that iPage is authorized to send emails on behalf of your domain.

---

### 2. DMARC Record (Domain-based Message Authentication)
**Email authentication and reporting**

```
Type: TXT
Host/Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:orders@marriageducation.com; pct=100; adkim=r; aspf=r
TTL: 3600 (or default)
```

**What this does:** 
- Tells email providers how to handle emails that fail authentication
- Sends reports to your email address
- `p=none` means monitor only (recommended for start)

---

### 3. DKIM Record (DomainKeys Identified Mail)
**Digital signature for your emails**

**⚠️ Important:** You need to get your DKIM key from iPage hosting.

**To get your DKIM record from iPage:**
1. Login to iPage control panel
2. Go to Email → Email Accounts → Authentication
3. Look for DKIM settings
4. Copy the DKIM record they provide

**Example format:**
```
Type: TXT
Host/Name: default._domainkey
Value: v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA... (long string from iPage)
TTL: 3600
```

---

## 🔧 How to Add DNS Records

### If you're using iPage DNS:

1. **Login to iPage Control Panel**
   - Go to: https://www.ipage.com/
   - Login with your credentials

2. **Navigate to DNS Settings**
   - Click "Domains" in the menu
   - Select "marriageducation.com"
   - Click "DNS Settings" or "Manage DNS"

3. **Add SPF Record**
   - Click "Add Record"
   - Type: TXT
   - Host: @ (or leave blank)
   - Value: `v=spf1 include:ipage.com ~all`
   - Save

4. **Add DMARC Record**
   - Click "Add Record"
   - Type: TXT
   - Host: _dmarc
   - Value: `v=DMARC1; p=none; rua=mailto:orders@marriageducation.com; pct=100; adkim=r; aspf=r`
   - Save

5. **Request DKIM from iPage Support**
   - Contact iPage support to enable DKIM for your email account
   - They will provide the DKIM record
   - Add it as a TXT record with the hostname they specify

---

### If you're using external DNS (Cloudflare, etc.):

Same process but in your DNS provider's control panel.

---

## ✅ Verify Your DNS Records

After adding records (wait 24-48 hours for propagation), verify them:

### Check SPF:
```bash
nslookup -type=txt marriageducation.com
```
Should show: `v=spf1 include:ipage.com ~all`

### Check DMARC:
```bash
nslookup -type=txt _dmarc.marriageducation.com
```
Should show: `v=DMARC1; p=none;...`

### Check DKIM:
```bash
nslookup -type=txt default._domainkey.marriageducation.com
```
Should show: `v=DKIM1; k=rsa; p=...`

---

## 🌐 Online Verification Tools

Use these free tools to check your email configuration:

1. **MX Toolbox** - https://mxtoolbox.com/SuperTool.aspx
   - Enter: marriageducation.com
   - Check SPF, DMARC, DKIM records

2. **Mail Tester** - https://www.mail-tester.com/
   - Send a test email to the address they provide
   - Get a deliverability score (aim for 10/10)

3. **Google Admin Toolbox** - https://toolbox.googleapps.com/apps/checkmx/
   - Check your domain's email configuration

---

## 📊 Expected Results

**Before adding DNS records:**
- ❌ Emails go to Promotions/Spam folder
- ⚠️ Low sender reputation
- ⚠️ No email authentication

**After adding DNS records:**
- ✅ Better inbox placement
- ✅ Higher sender reputation
- ✅ Email authentication passes
- ✅ Professional email setup

---

## 🆘 Troubleshooting

### Emails still going to spam?

1. **Wait for DNS propagation** (24-48 hours)
2. **Check records are correct** (use verification tools above)
3. **Warm up your domain** - Send emails gradually:
   - Day 1-3: 5-10 emails/day
   - Week 2: 20-50 emails/day
   - Week 3+: Normal volume
4. **Ask recipients to whitelist** orders@marriageducation.com
5. **Monitor DMARC reports** - Check your inbox for reports from email providers

### Need help?

Contact iPage support:
- Phone: (Check your iPage account)
- Email: support@ipage.com
- Live Chat: Available in iPage control panel

Or contact me: orders@marriageducation.com

---

## 📝 Additional Recommendations

### 1. Add a Custom Domain in Email Headers
Already done in your server.rb:
```ruby
from "Marriage Education <orders@marriageducation.com>"
reply_to orders@marriageducation.com
```

### 2. Monitor Email Deliverability
- Check DMARC reports weekly
- Monitor bounce rates
- Track open rates

### 3. Consider Email Service Provider (Optional)
If email deliverability is still poor after DNS setup, consider:
- SendGrid (transactional emails)
- Mailgun (developer-friendly)
- Amazon SES (AWS)
- Postmark (high deliverability)

These services have better deliverability but cost money.

---

## 🎉 Summary Checklist

- [ ] Add SPF record to DNS
- [ ] Add DMARC record to DNS
- [ ] Request and add DKIM record from iPage
- [ ] Wait 24-48 hours for DNS propagation
- [ ] Verify records using online tools
- [ ] Send test emails and check inbox placement
- [ ] Monitor DMARC reports
- [ ] Whitelist sender address in your email

**Your email setup will be professional-grade once these records are in place!**

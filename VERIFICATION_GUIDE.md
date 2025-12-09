# 🧪 System Verification Guide - All Features

## Quick Start: Complete System Test (10 Minutes)

Run these commands to verify everything works:

```bash
# 1. Check system health
curl https://marriage-education-website.onrender.com/health | python3 -m json.tool

# 2. Login and get session token
curl -X POST "https://marriage-education-website.onrender.com/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"admin-secret-2024"}' | python3 -m json.tool

# Copy the token from response, then:

# 3. Get dashboard statistics
curl "https://marriage-education-website.onrender.com/admin/dashboard-stats" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" | python3 -m json.tool

# 4. View security logs
curl "https://marriage-education-website.onrender.com/admin/security-logs" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" | python3 -m json.tool | head -50

# 5. View download tokens
curl "https://marriage-education-website.onrender.com/admin/tokens" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" | python3 -m json.tool
```

---

## ✅ 1. Secure Authentication

### Test Login Success
Open terminal and run:
```bash
curl -X POST "https://marriage-education-website.onrender.com/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"admin-secret-2024"}'
```

**✅ Success looks like:**
```json
{
  "success": true,
  "token": "abc123...",
  "expires_in": 86400,
  "message": "Login successful"
}
```

**Save your token** - you'll need it for other tests!

### Test Wrong Password (Rate Limiting)
```bash
# Try 6 times with wrong password
for i in {1..6}; do
  echo "Attempt $i:"
  curl -X POST "https://marriage-education-website.onrender.com/admin/login" \
    -H "Content-Type: application/json" \
    -d '{"password":"wrong"}'
  echo ""
done
```

**✅ After 5 attempts:** Should get `429 Too Many Requests`

---

## ✅ 2. Customer Self-Service

### Test Resend Download Link Page

**In Browser:**
1. Go to: `https://marriage-education-website.onrender.com/resend-link.html`
2. Enter email from a previous purchase
3. Click "Send Download Link(s)"
4. Check your email (including Promotions folder)
5. Try 4 times - 4th should be rate limited

**Via Command Line:**
```bash
curl -X POST "https://marriage-education-website.onrender.com/resend-download-link" \
  -H "Content-Type: application/json" \
  -d '{"email":"your-test-email@example.com"}'
```

**✅ Success:**
```json
{
  "success": true,
  "message": "Download links have been sent to...",
  "links_sent": 1
}
```

---

## ✅ 3. Admin Dashboard Data

### Get Statistics
```bash
curl "https://marriage-education-website.onrender.com/admin/dashboard-stats" \
  -H "Authorization: Bearer YOUR_TOKEN" | python3 -m json.tool
```

**✅ Should show:**
- Total payments (pending/approved/rejected)
- Total revenue in FCFA
- Active vs expired tokens
- Total downloads
- Product breakdown with sales counts
- Security events (last 24h)

**Verify:** Numbers match your actual payment data

---

## ✅ 4. Email Deliverability

### Check Current Email Setup
```bash
curl https://marriage-education-website.onrender.com/health | python3 -m json.tool
```

Look for:
```json
"email": "configured",
"email_settings": "smtp.ipage.com:465 as orders@marriageducation.com"
```

### Follow DNS Setup (Improves Deliverability)

**Read the guide:**
```bash
cat DNS_EMAIL_SETUP.md
```

**Key steps:**
1. Add SPF record: `v=spf1 include:ipage.com ~all`
2. Add DMARC record to `_dmarc` subdomain
3. Request DKIM from iPage support

**Verify DNS (after 24-48 hours):**
```bash
nslookup -type=txt marriageducation.com
nslookup -type=txt _dmarc.marriageducation.com
```

**Test deliverability:**
1. Go to https://www.mail-tester.com/
2. Get the test email address
3. Submit a payment with that email
4. Approve it (email will be sent)
5. Check your score (aim for 8+/10)

---

## ✅ 5. Comprehensive Security

### View Security Logs
```bash
curl "https://marriage-education-website.onrender.com/admin/security-logs" \
  -H "Authorization: Bearer YOUR_TOKEN" | python3 -m json.tool
```

**✅ Should show:**
- Total security events
- Event types summary (invalid tokens, unauthorized access, etc.)
- Recent events with timestamps, IP addresses, user agents

### Test Security Logging

**Try invalid download:**
```bash
curl "https://marriage-education-website.onrender.com/download?token=invalid123"
```

**Then check if it was logged:**
```bash
curl "https://marriage-education-website.onrender.com/admin/security-logs" \
  -H "Authorization: Bearer YOUR_TOKEN" | python3 -m json.tool | head -50
```

**✅ Should see:** Your invalid token attempt in recent_events

---

## ✅ 6. Rate Limiting & Monitoring

### Test Payment Submission Limit (5 per 5 minutes)
```bash
for i in {1..6}; do
  echo "Submission $i:"
  curl -X POST "https://marriage-education-website.onrender.com/submit-manual-payment" \
    -H "Content-Type: application/json" \
    -d '{
      "reference": "TEST-RATE-'$i'",
      "product_id": "sbd-for-dummies",
      "product_name": "Test Product",
      "amount": "15000",
      "currency": "FCFA",
      "phone": "237123456789",
      "email": "test@example.com",
      "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
    }'
  echo ""
  echo "---"
done
```

**✅ Expected:** 
- Requests 1-5: Success
- Request 6: `429 Too Many Requests`

### Test Download Limit (10 per minute)
```bash
for i in {1..11}; do
  echo "Attempt $i:"
  curl -s -o /dev/null -w "Status: %{http_code}\n" \
    "https://marriage-education-website.onrender.com/download?token=test$i"
done
```

**✅ Expected:** 11th attempt returns `429`

---

## ✅ 7. Professional Email Templates

### Test Customer Email
1. **Submit test payment:**
   - Go to https://marriageducation.com/payment.html
   - Use your email address
   - Fill all fields and submit

2. **Approve payment:**
   - Login at https://marriageducation.com/admin-payments.html
   - Password: `admin-secret-2024`
   - Click "Approve" on your test payment

3. **Check email (Promotions folder):**

**✅ Email should have:**
- Yellow header with "Your Purchase is Confirmed!"
- Product name
- Large black download button
- Expiry date and download limit (7 days, 5 downloads)
- Professional styling
- Support contact email

### Test Admin Notification
**When you submit a payment above, you should also receive an admin email to orders@marriageducation.com with:**

**✅ Admin email should have:**
- Red/orange "New Payment Pending Approval" header
- Payment reference and amount
- Customer email and phone
- Product name
- Link to admin panel
- Professional alert-style template

### Test Resend Email
1. Use the resend link page: `https://marriage-education-website.onrender.com/resend-link.html`
2. Enter email with existing downloads
3. Check email inbox

**✅ Resend email should have:**
- List of all active download links
- Each link shows: Product name, expiry, remaining downloads
- Clean, organized layout
- Support contact

---

## ✅ 8. Download Tracking & Limits

### Test Download Count

**Get a valid token:**
```bash
curl "https://marriage-education-website.onrender.com/admin/tokens" \
  -H "Authorization: Bearer YOUR_TOKEN" | python3 -m json.tool
```

Copy a token from the list, then:

```bash
TOKEN="your-actual-token-here"

# Download 5 times
for i in {1..5}; do
  echo "Download $i:"
  curl -o "download$i.pdf" \
    "https://marriage-education-website.onrender.com/download?token=$TOKEN"
  echo ""
done

# Try 6th time
echo "Attempt 6 (should fail):"
curl "https://marriage-education-website.onrender.com/download?token=$TOKEN"
```

**✅ Expected:**
- Downloads 1-5: PDF file received
- Download 6: `403 Download limit reached. You have already downloaded this file 5 times.`

### Verify Token Updates
```bash
curl "https://marriage-education-website.onrender.com/admin/tokens" \
  -H "Authorization: Bearer YOUR_TOKEN" | python3 -m json.tool
```

**✅ Check:**
- `download_count` should increase after each download
- `max_downloads` is 5
- `expires_at` is 7 days from approval
- `status` is "active"

### Test Expiry

**Create new payment and check expiry date:**
```bash
curl "https://marriage-education-website.onrender.com/admin/tokens" \
  -H "Authorization: Bearer YOUR_TOKEN" | python3 -m json.tool
```

**✅ Verify:** `expires_at` is exactly 7 days from `created_at`

---

## 📋 Complete Verification Checklist

Print this and check off as you test:

### Authentication ✓
- [ ] Login with correct password works
- [ ] Wrong password rejected
- [ ] Rate limiting after 5 failed attempts
- [ ] Session token allows access to admin endpoints
- [ ] Old Bearer token still works (backwards compatible)

### Customer Features ✓
- [ ] Resend link page loads properly
- [ ] Can request download links via form
- [ ] Email arrives with download links
- [ ] Rate limited after 3 requests per hour
- [ ] Works when customer has multiple active tokens

### Admin Dashboard ✓
- [ ] Dashboard stats endpoint returns data
- [ ] Payment counts are accurate
- [ ] Revenue calculation correct
- [ ] Product breakdown shows all products
- [ ] Security event counts match logs

### Email System ✓
- [ ] Customer download emails look professional
- [ ] Admin notification emails arrive immediately
- [ ] Resend emails contain all active links
- [ ] Emails include all required information
- [ ] Email deliverability guide exists (DNS_EMAIL_SETUP.md)

### Security ✓
- [ ] Failed login attempts logged with IP
- [ ] Invalid tokens logged
- [ ] Security logs accessible via API
- [ ] All events have timestamps and IPs
- [ ] Rate limiting protects all endpoints

### Download System ✓
- [ ] Downloads work with valid tokens
- [ ] Download counter increments
- [ ] 5-download limit enforced
- [ ] Tokens expire after 7 days
- [ ] Expired tokens return proper error

### Rate Limits ✓
- [ ] Payment submission: 5 per 5 minutes
- [ ] Admin login: 5 per 15 minutes  
- [ ] Download attempts: 10 per minute
- [ ] Resend link: 3 per hour per email
- [ ] All return 429 when exceeded

---

## 🎯 One-Command Full Test

Run this to test everything at once:

```bash
#!/bin/bash
echo "=== MARRIAGE EDUCATION SYSTEM TEST ===" echo ""

echo "1. Health Check..."
curl -s https://marriage-education-website.onrender.com/health | python3 -m json.tool
echo ""

echo "2. Admin Login..."
TOKEN=$(curl -s -X POST "https://marriage-education-website.onrender.com/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"admin-secret-2024"}' | python3 -c "import sys, json; print(json.load(sys.stdin).get('token', 'FAILED'))" 2>/dev/null)

if [ "$TOKEN" = "FAILED" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed - check password or server"
  exit 1
fi

echo "✅ Login successful! Token: ${TOKEN:0:20}..."
echo ""

echo "3. Dashboard Stats..."
curl -s "https://marriage-education-website.onrender.com/admin/dashboard-stats" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -30
echo ""

echo "4. Security Logs (last 5 events)..."
curl -s "https://marriage-education-website.onrender.com/admin/security-logs" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -50
echo ""

echo "5. Download Tokens..."
curl -s "https://marriage-education-website.onrender.com/admin/tokens" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

echo "=== TEST COMPLETE ==="
echo "✅ All API endpoints are working!"
```

Save as `test-system.sh`, make executable (`chmod +x test-system.sh`), and run!

---

## 🆘 Troubleshooting

### "Not Found" or "Unauthorized" errors
- Wait 2-3 minutes for Render to finish deploying
- Check if you used the correct password
- Verify you copied the full token (no spaces)

### Emails not arriving
- Check spam/junk/promotions folder
- Follow DNS_EMAIL_SETUP.md to improve deliverability
- Check Render logs for email errors

### Rate limiting too strict
You can adjust in `server.rb`:
- Payment: Line ~600 - `check_rate_limit("submit_payment_#{request.ip}", 5, 300)`
- Login: Line ~350 - `check_rate_limit("admin_login_#{request.ip}", 5, 900)`
- Download: Line ~930 - `check_rate_limit("download_#{request.ip}", 10, 60)`

### Session token not working
Use old-style token instead:
```bash
-H "Authorization: Bearer admin-secret-2024"
```

Sessions are in-memory and reset when server restarts.

---

## ✅ Success Criteria

**Your system is working if:**
- ✅ All API endpoints return valid JSON (not HTML errors)
- ✅ Login returns a session token
- ✅ Dashboard stats show your actual data
- ✅ Security logs capture events
- ✅ Emails arrive within 60 seconds
- ✅ Downloads work with valid tokens
- ✅ Rate limits protect endpoints
- ✅ Download limits enforced (5 max)
- ✅ Tokens expire after 7 days

**Congratulations! Your system is production-ready! 🎉**

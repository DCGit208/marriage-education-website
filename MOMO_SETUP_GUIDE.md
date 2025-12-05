# MTN MOMO Integration - Setup & Testing Guide

## ✅ Phase 1 Complete: Code Implementation

All MOMO integration files have been created on the `feature/mtn-momo-payment` branch.

### Files Created:
- ✅ `momo/server.rb` - MTN MOMO backend API (293 lines)
- ✅ `momo/Gemfile` - Ruby dependencies
- ✅ `momo/public/momo-checkout.html` - MOMO payment UI
- ✅ `momo/public/momo-checkout.js` - MOMO payment logic
- ✅ `momo/.env.example` - Environment variables template
- ✅ `render-momo.yaml` - Render deployment config
- ✅ `payment.html` - Updated with dual payment options (MOMO + Stripe)

### Protected Files (NOT MODIFIED):
- ✅ `stripe/server.rb` - Stripe backend unchanged
- ✅ `stripe/public/checkout.js` - Stripe frontend unchanged
- ✅ All Stripe functionality preserved

---

## 📋 Phase 2: Setup MTN MOMO API Credentials

### Required Credentials

You need to obtain these from MTN MOMO Developer Portal:

1. **Primary Key** ✅ (already provided)
   - Collections API Primary Key: `4455fd39957b48e281efde9612b55530`

2. **Subscription Key** ⏳ (need to obtain)
   - Go to: https://momodeveloper.mtn.com/
   - Navigate to your Collections product
   - Copy the "Ocp-Apim-Subscription-Key"

3. **API User** ⏳ (need to create)
   - Use MTN MOMO API to create a user in sandbox:
   ```bash
   # Create API User
   curl -X POST https://sandbox.momodeveloper.mtn.com/v1_0/apiuser \
     -H "X-Reference-Id: YOUR_UUID_HERE" \
     -H "Ocp-Apim-Subscription-Key: YOUR_SUBSCRIPTION_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "providerCallbackHost": "marriageducation.com"
     }'
   ```

4. **API Key** ⏳ (generate after creating user)
   ```bash
   # Generate API Key
   curl -X POST https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/YOUR_API_USER_UUID/apikey \
     -H "Ocp-Apim-Subscription-Key: YOUR_SUBSCRIPTION_KEY"
   ```

### Setup Instructions

#### Option 1: I can help you create API User/Key
Provide me with:
- Your MTN MOMO Subscription Key
- I'll run the API calls to create user and key

#### Option 2: You create them manually
Follow the curl commands above and provide me:
- Subscription Key
- API User UUID
- API Key

---

## 🧪 Phase 3: Local Testing

### Install Dependencies
```bash
cd momo
bundle install
```

### Configure Environment
```bash
cd momo
cp .env.example .env
# Edit .env with your credentials
```

### Start MOMO Server
```bash
cd momo
bundle exec ruby server.rb
```

Server will start on: http://localhost:4243

### Test Payment Flow
1. Open: http://localhost:5500/payment.html?product=sbd-for-dummies&price=27
2. Click "Pay with MTN MOMO"
3. Enter test phone number: 237670000000 (sandbox test number)
4. Check server logs for payment status

### Expected Flow:
```
1. User enters phone number
2. Server creates payment request → MTN MOMO API
3. User receives USSD prompt on phone (in sandbox, simulated)
4. Server polls payment status every 5 seconds
5. On success: Redirect to success page
6. On failure: Show error message
```

---

## 🚀 Phase 4: Deploy to Render

### Create MOMO Service on Render

1. Go to https://dashboard.render.com/
2. Click "New +" → "Web Service"
3. Connect your GitHub repo: `DCGit208/marriage-education-website`
4. Configure:
   - **Name:** marriage-education-momo
   - **Branch:** feature/mtn-momo-payment
   - **Root Directory:** momo
   - **Runtime:** Ruby
   - **Build Command:** `bundle install`
   - **Start Command:** `bundle exec ruby server.rb`
   - **Plan:** Free

5. Add Environment Variables:
   - `MTN_MOMO_PRIMARY_KEY` = `4455fd39957b48e281efde9612b55530`
   - `MTN_MOMO_SUBSCRIPTION_KEY` = (your subscription key)
   - `MTN_MOMO_API_USER` = (your API user UUID)
   - `MTN_MOMO_API_KEY` = (your API key)
   - `MTN_MOMO_ENVIRONMENT` = `sandbox`
   - `MTN_MOMO_BASE_URL` = `https://sandbox.momodeveloper.mtn.com`
   - `YOUR_DOMAIN` = `https://marriageducation.com`

6. Deploy

### Update Frontend URLs

Once deployed, you'll get a URL like:
`https://marriage-education-momo.onrender.com`

Update `momo/public/momo-checkout.js`:
- Change production API URL to your Render URL

---

## ✅ Phase 5: Testing Checklist

### Local Testing (Sandbox)
- [ ] MOMO server starts without errors
- [ ] Can access http://localhost:4243/health
- [ ] Payment page shows both MOMO and Stripe options
- [ ] Clicking "Pay with MTN MOMO" redirects correctly
- [ ] Can enter phone number
- [ ] Payment request creates successfully
- [ ] Payment status polling works
- [ ] Stripe flow still works (no regression)

### Render Testing (Sandbox)
- [ ] MOMO service deploys successfully
- [ ] Health check endpoint works
- [ ] Can create payment request
- [ ] Payment status updates correctly
- [ ] Error handling works
- [ ] Logs show proper debugging info

### Production Testing (Real Money)
- [ ] Switch to production credentials
- [ ] Update `MTN_MOMO_ENVIRONMENT` to `production`
- [ ] Update `MTN_MOMO_BASE_URL` to production URL
- [ ] Test with small amount (100 FCFA)
- [ ] Verify successful payment delivers eBook
- [ ] Monitor for errors

---

## 🎯 Phase 6: Merge to Main

### Pre-Merge Checklist
- [ ] All sandbox tests pass
- [ ] Stripe payments still work
- [ ] No errors in logs
- [ ] Code reviewed and approved
- [ ] Rollback procedure tested

### Merge Commands
```bash
# On feature branch
git add .
git commit -m "Add MTN MOMO payment integration with dual-gateway architecture"
git push origin feature/mtn-momo-payment

# Switch to main
git checkout main
git merge feature/mtn-momo-payment
git push origin main
```

---

## 🚨 Rollback Procedure

If anything breaks:

### Quick Rollback (< 2 minutes)
```bash
git checkout main
git reset --hard backup/pre-momo-integration
git push origin main --force
```

### Remove MOMO Service from Render
- Go to Render dashboard
- Delete `marriage-education-momo` service
- OR disable auto-deploy and stop service

---

## 📊 Current Status

### Completed:
- ✅ Safety measures (backup tag + branch)
- ✅ Feature branch created
- ✅ All MOMO code implemented
- ✅ Payment.html updated with dual options
- ✅ Stripe system unchanged (zero risk)

### Waiting For:
- ⏳ MTN MOMO API credentials (Subscription Key, API User, API Key)
- ⏳ Your approval to proceed with testing
- ⏳ Local testing validation
- ⏳ Deploy to Render
- ⏳ Integration testing
- ⏳ Merge to main

---

## 🎬 Next Actions

### What You Need to Do:

1. **Obtain MTN MOMO Credentials**
   - Visit https://momodeveloper.mtn.com/
   - Get Subscription Key
   - Create API User
   - Generate API Key
   - Share with me or add to .env

2. **Review the Code**
   - Check momo/server.rb
   - Check momo/public/momo-checkout.html
   - Check updated payment.html
   - Approve or request changes

3. **Test Locally** (optional)
   - Install dependencies: `cd momo && bundle install`
   - Configure .env with your credentials
   - Start server: `bundle exec ruby server.rb`
   - Test payment flow

4. **Approve Deployment**
   - Confirm you want to deploy to Render
   - Or request more testing first

### What I'll Do Next:

1. Help you obtain MTN MOMO credentials if needed
2. Test the integration locally once you provide credentials
3. Deploy to Render when you approve
4. Monitor first transactions
5. Merge to main after successful testing

---

## 🔍 Code Quality & Architecture

### Dual-Gateway Benefits:
- ✅ Stripe and MOMO completely isolated
- ✅ Each runs on separate port/service
- ✅ Shared product database (read-only)
- ✅ Easy to disable MOMO without affecting Stripe
- ✅ Can test independently

### Error Handling:
- ✅ Token caching (reduces API calls)
- ✅ Phone number validation
- ✅ Amount validation (minimum 100 FCFA)
- ✅ Graceful failures with user-friendly messages
- ✅ Comprehensive logging
- ✅ Payment status polling with timeout

### Security:
- ✅ Environment variables for secrets
- ✅ CORS enabled for cross-origin requests
- ✅ OAuth2 token authentication
- ✅ Request signature verification (webhook)
- ✅ Input sanitization

---

## 📞 Support & Communication

**Questions?**
- Review the code in `momo/` directory
- Check MTN_MOMO_INTEGRATION_PLAN.md for full strategy
- Ask me anything before proceeding

**Ready to Test?**
Reply with:
- "READY - I have the credentials" (and provide them)
- "HELP - I need help getting credentials"
- "REVIEW - I want to review the code first"
- "WAIT - I have concerns about: [specific issue]"

**Current Branch:** `feature/mtn-momo-payment`  
**Backup Available:** `backup/pre-momo-integration`  
**Rollback Tag:** `momo-pre-integration`

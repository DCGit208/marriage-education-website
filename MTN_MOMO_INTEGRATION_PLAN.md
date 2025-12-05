# MTN Mobile Money (MOMO) Integration Plan

**Date:** December 5, 2025  
**Current System:** Stripe Payment Gateway (Production-Ready)  
**New Addition:** MTN MOMO Collections API  
**Primary Key:** `4455fd39957b48e281efde9612b55530`

---

## ⚠️ CRITICAL: Safety First Approach

### Pre-Implementation Safety Measures

1. **Create Git Backup Tag**
   ```bash
   git tag -a momo-pre-integration -m "Stable state before MTN MOMO integration"
   git push origin momo-pre-integration
   ```

2. **Create Rollback Branch**
   ```bash
   git checkout -b backup/pre-momo-integration
   git push origin backup/pre-momo-integration
   git checkout main
   ```

3. **Working Branch Strategy**
   ```bash
   git checkout -b feature/mtn-momo-payment
   # All changes happen here, NOT on main
   # Only merge to main after testing confirms success
   ```

---

## 📋 Current System Analysis

### Working Components (DO NOT MODIFY)
1. **stripe/server.rb** - Stripe backend API
   - POST `/create-checkout-session` - Working perfectly
   - POST `/webhooks` - Stripe webhook handler
   - GET `/download` - eBook delivery
   - GET `/session-status` - Session verification

2. **stripe/public/checkout.js** - Frontend redirect
   - Version: v8 (production-ready)
   - Works with both localhost and production

3. **payment.html** - Payment entry page
   - Shows order summary
   - Redirects to checkout.html with params

4. **Deployment**
   - Render.com: https://marriage-education-stripe.onrender.com
   - GitHub auto-deploy enabled

### Integration Points (Where MOMO Will Connect)
- **payment.html** - Add MOMO payment option UI
- **New file: momo/server.rb** - Separate MOMO backend (isolated from Stripe)
- **New file: momo/public/momo-checkout.js** - MOMO-specific frontend
- **Shared: products.csv** - Product database (read-only access)

---

## 🎯 Integration Strategy

### Option 1: Dual-Gateway Architecture (RECOMMENDED)

**Why This Approach:**
- ✅ Zero risk to existing Stripe system
- ✅ Easy rollback (just remove MOMO files)
- ✅ Independent testing without breaking Stripe
- ✅ Users can choose payment method on payment.html

**Architecture:**
```
payment.html (Payment Method Selection)
    ├── [Pay with Stripe] → stripe/public/checkout.html → Stripe Checkout
    └── [Pay with MTN MOMO] → momo/public/momo-checkout.html → MTN MOMO API
```

**Implementation Steps:**

#### Phase 1: Setup & Environment (No Code Changes)
1. Add MTN MOMO credentials to Render environment variables
   - `MTN_MOMO_PRIMARY_KEY` = `4455fd39957b48e281efde9612b55530`
   - `MTN_MOMO_SUBSCRIPTION_KEY` (need to obtain)
   - `MTN_MOMO_API_USER` (need to create)
   - `MTN_MOMO_API_KEY` (need to generate)
   - `MTN_MOMO_ENVIRONMENT` = `sandbox` (for testing)

2. Research MTN MOMO Collections API requirements
   - API Base URL (sandbox vs production)
   - Authentication flow (OAuth2 token generation)
   - Request/Response formats
   - Webhook callback URLs
   - Error codes and handling

#### Phase 2: Create Isolated MOMO Backend
**New Directory Structure:**
```
Marriageducation/
├── stripe/              (existing - DO NOT TOUCH)
│   ├── server.rb
│   ├── public/
│   └── products.csv
├── momo/                (NEW - isolated)
│   ├── server.rb        (NEW - MOMO Collections API)
│   ├── public/
│   │   ├── momo-checkout.html
│   │   └── momo-checkout.js
│   └── Gemfile          (NEW - MOMO-specific gems)
└── payment.html         (MODIFY - add payment method selector)
```

**New File: momo/server.rb**
```ruby
require 'sinatra'
require 'httparty'
require 'json'
require 'dotenv/load'

set :static, true
set :bind, '0.0.0.0'
set :port, ENV['PORT'] || 4243  # Different port than Stripe
set :public_folder, File.dirname(__FILE__) + '/public'

# MTN MOMO Configuration
MTN_MOMO_PRIMARY_KEY = ENV['MTN_MOMO_PRIMARY_KEY']
MTN_MOMO_BASE_URL = ENV['MTN_MOMO_BASE_URL'] || 'https://sandbox.momodeveloper.mtn.com'

# Routes:
# POST /create-momo-payment
# GET /momo-payment-status
# POST /momo-webhook

# Implementation will follow MTN MOMO Collections API v1.0 specification
```

#### Phase 3: Update payment.html (Minimal Changes)
**Change:** Add payment method selection UI
```html
<!-- EXISTING: Order Summary (keep as-is) -->
<div class="order-summary">...</div>

<!-- NEW: Payment Method Selector -->
<div class="payment-method-section">
  <h3>Choose Payment Method</h3>
  
  <!-- Option 1: Stripe (International Cards) -->
  <div class="payment-option stripe-option">
    <input type="radio" name="payment-method" id="stripe" value="stripe" checked>
    <label for="stripe">
      <h4>Credit/Debit Card (Stripe)</h4>
      <p>Visa, Mastercard, Amex - Secure international payments</p>
    </label>
    <button id="stripe-pay-btn" class="pay-button">Pay with Card →</button>
  </div>
  
  <!-- Option 2: MTN MOMO (Local) -->
  <div class="payment-option momo-option">
    <input type="radio" name="payment-method" id="momo" value="momo">
    <label for="momo">
      <h4>MTN Mobile Money</h4>
      <p>Pay with MTN MOMO (Cameroon) - 237XXXXXXXX</p>
    </label>
    <button id="momo-pay-btn" class="pay-button">Pay with MOMO →</button>
  </div>
</div>
```

**JavaScript Changes:**
```javascript
// EXISTING: Get product params (keep as-is)
const productId = getUrlParameter('product');
const productName = getUrlParameter('name');
// ... etc

// NEW: Payment method routing
document.getElementById('stripe-pay-btn').addEventListener('click', () => {
  // Redirect to EXISTING Stripe checkout (no changes to Stripe flow)
  window.location.href = `stripe/public/checkout.html?product=${productId}&name=${productName}&price=${productPrice}&currency=${productCurrency}`;
});

document.getElementById('momo-pay-btn').addEventListener('click', () => {
  // Redirect to NEW MOMO checkout
  window.location.href = `momo/public/momo-checkout.html?product=${productId}&name=${productName}&price=${productPrice}&currency=${productCurrency}`;
});
```

#### Phase 4: Implement MOMO Collections API Integration
**Key Components:**

1. **Authentication** - OAuth2 Bearer Token
   - POST `/collection/token/` with Basic Auth (API User + API Key)
   - Cache token (valid for 1 hour)
   - Auto-refresh before expiry

2. **Payment Request** - Request to Pay
   - POST `/collection/v1_0/requesttopay`
   - Headers: Authorization, X-Reference-Id, X-Target-Environment
   - Body: { amount, currency: "XAF", externalId, payer: { partyIdType: "MSISDN", partyId: "237XXXXXXXX" }, payerMessage, payeeNote }

3. **Payment Status Check**
   - GET `/collection/v1_0/requesttopay/{referenceId}`
   - Poll every 5 seconds for max 2 minutes
   - States: PENDING, SUCCESSFUL, FAILED

4. **Webhook Handler** (if supported)
   - POST `/momo-webhook`
   - Verify signature
   - Update order status

#### Phase 5: Testing Strategy
**Sandbox Testing (Before Production)**
1. Test with MTN MOMO sandbox account
2. Test all payment flows:
   - Successful payment
   - Failed payment (insufficient balance)
   - Timeout scenario
   - Invalid phone number
3. Test Stripe flow still works (no regression)
4. Test product delivery after successful MOMO payment
5. Test error handling and user feedback

**Production Testing**
1. Deploy to separate Render service (not main backend)
2. Test with real FCFA amount (small test: 100 FCFA)
3. Verify webhook callbacks
4. Monitor logs for errors

---

## 🔐 Deployment Strategy

### Option A: Separate Render Service (SAFEST)
```yaml
# render-momo.yaml (NEW FILE)
services:
  - type: web
    name: marriage-education-momo
    runtime: ruby
    plan: free
    buildCommand: cd momo && bundle install
    startCommand: cd momo && bundle exec ruby server.rb
    envVars:
      - key: MTN_MOMO_PRIMARY_KEY
        sync: false
      - key: MTN_MOMO_SUBSCRIPTION_KEY
        sync: false
      - key: MTN_MOMO_API_USER
        sync: false
      - key: MTN_MOMO_API_KEY
        sync: false
      - key: MTN_MOMO_BASE_URL
        value: https://sandbox.momodeveloper.mtn.com
    autoDeploy: false  # Manual deploy only
```

### Option B: Combined Service (Requires Testing)
- Add MOMO server to existing Render deployment
- Use process manager (foreman) to run both Stripe + MOMO servers
- Higher risk of affecting Stripe

**RECOMMENDATION:** Use Option A (Separate Service)

---

## 📊 Testing Checklist

### Pre-Deployment Tests (Local)
- [ ] MOMO server starts without errors
- [ ] MOMO authentication generates valid token
- [ ] Payment request creates transaction
- [ ] Payment status polling works
- [ ] Error handling displays user-friendly messages
- [ ] Stripe checkout still works (no regression)

### Post-Deployment Tests (Sandbox)
- [ ] payment.html loads correctly
- [ ] Can select Stripe payment method
- [ ] Can select MOMO payment method
- [ ] Stripe flow completes successfully
- [ ] MOMO flow initiates payment request
- [ ] MOMO payment status updates correctly
- [ ] Failed payments show proper error messages
- [ ] Successful payments trigger eBook delivery

### Production Readiness
- [ ] All sandbox tests pass
- [ ] Real MOMO account configured
- [ ] Production API credentials added to Render
- [ ] Error logging and monitoring enabled
- [ ] Rollback procedure documented and tested

---

## 🚨 Rollback Procedure

### If MOMO Integration Fails
**Immediate Rollback (< 2 minutes):**
```bash
# Option 1: Revert to backup branch
git checkout main
git reset --hard backup/pre-momo-integration
git push origin main --force

# Option 2: Revert specific commit
git revert <commit-hash>
git push origin main
```

**Remove MOMO Service from Render:**
- Delete marriage-education-momo service
- OR disable autoDeploy and stop service

**Frontend Cleanup:**
- Revert payment.html to previous version
- Remove momo/ directory

### If Stripe Breaks (Unlikely with Dual-Gateway)
```bash
# Restore from tag
git checkout momo-pre-integration
git checkout -b hotfix/restore-stripe
git push origin hotfix/restore-stripe
# Deploy hotfix branch to Render
```

---

## 🎯 Success Criteria

### Minimum Viable Integration
1. Users can see "Pay with MTN MOMO" option on payment.html
2. Clicking MOMO option initiates MTN MOMO payment flow
3. User enters phone number and confirms payment on their phone
4. Payment status is checked and confirmed
5. Successful payment delivers eBook download link
6. Failed payment shows clear error message
7. Stripe payment option still works perfectly (no regression)

### Advanced Features (Phase 2)
1. Direct USSD prompt (no manual phone entry)
2. Real-time payment status via webhooks
3. Payment retry logic
4. Multiple currency support (XAF, XOF)
5. Transaction history and reporting

---

## 📝 Implementation Timeline

### Phase 1: Research & Setup (1-2 hours)
- MTN MOMO API documentation review
- Credential setup (API User, API Key)
- Environment variables configuration
- Create backup tag and branch

### Phase 2: Backend Development (2-3 hours)
- Create momo/server.rb
- Implement authentication
- Implement payment request
- Implement status polling
- Error handling

### Phase 3: Frontend Updates (1 hour)
- Update payment.html with method selector
- Create momo-checkout.html
- Create momo-checkout.js
- Style payment options

### Phase 4: Testing (2-3 hours)
- Local testing with sandbox
- Deploy to separate Render service
- Integration testing
- Regression testing (Stripe)

### Phase 5: Production Deployment (1 hour)
- Update to production credentials
- Deploy to production Render service
- Monitor first transactions
- Document for support team

**Total Estimated Time:** 7-10 hours

---

## 🤔 Questions to Answer Before Implementation

1. **MTN MOMO API Access:**
   - Do you have API User and API Key already?
   - Is your account approved for production?
   - What is your callback URL for webhooks?

2. **Currency & Pricing:**
   - All MOMO payments will be in XAF (FCFA)?
   - Should USD prices auto-convert to FCFA?
   - Exchange rate: Use fixed (1 USD = 600 FCFA) or dynamic API?

3. **User Experience:**
   - Should MOMO be default for Cameroon users?
   - Detect user location and suggest payment method?
   - Show both methods or switch based on location?

4. **Testing:**
   - Do you have access to MTN MOMO sandbox account?
   - Can we test with real small amounts (100 FCFA)?

5. **Support:**
   - Who handles failed MOMO transactions?
   - Refund policy for MOMO payments?
   - Customer support contact for payment issues?

---

## ✅ Review & Approval Checklist

Before I start implementation, please confirm:

- [ ] **Reviewed this entire plan** and understand the approach
- [ ] **Agreed on Dual-Gateway Architecture** (separate MOMO backend)
- [ ] **Approved creating backup tag and branch** for rollback safety
- [ ] **Confirmed working on feature branch** (not main) until testing complete
- [ ] **Provided MTN MOMO API credentials** (or confirmed what's needed)
- [ ] **Answered all questions in Section 🤔** above
- [ ] **Approved testing strategy** (sandbox first, then production)
- [ ] **Understood rollback procedure** if something goes wrong
- [ ] **Ready to allocate 7-10 hours** for full implementation and testing

---

## 🎬 Next Steps

**Once you approve this plan:**

1. I will create the backup tag and branch
2. Create feature/mtn-momo-payment branch
3. Begin Phase 1: Research & Setup
4. Share progress updates after each phase
5. Request your review before merging to main

**Your action items:**

1. Review this plan thoroughly
2. Answer the questions in Section 🤔
3. Provide any additional MTN MOMO credentials needed
4. Approve the plan or request modifications
5. Confirm you're ready to begin

---

**⚠️ Important:** No code changes will be made to `main` branch until:
- All testing is complete
- You have reviewed and approved the changes
- Rollback procedure has been tested and confirmed working

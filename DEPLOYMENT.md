# Ruby Backend Deployment Guide

Your Stripe backend now follows best practices with webhooks, idempotency keys, and production-ready error handling.

## Local Testing (Already Working ✅)

Your local setup works perfectly:
```bash
cd stripe
ruby server.rb
# Opens on http://localhost:4242
```

## Production Deployment Options

Since iPage doesn't support Ruby servers, you need to deploy the backend to a compatible platform:

### Option 1: Render.com (Recommended - FREE)

1. **Go to:** https://render.com/
2. **Sign up** with your GitHub account
3. **Click "New +"** → "Web Service"
4. **Connect GitHub repo:** `DCGit208/marriage-education-website`
5. **Render will auto-detect** the `render.yaml` file
6. **Add environment variables:**
   - `STRIPE_API_KEY`: Your Stripe secret key (sk_live_...)
   - `STRIPE_WEBHOOK_SECRET`: Get from Stripe Dashboard → Webhooks
   - `YOUR_DOMAIN`: `https://marriageducation.com`
7. **Deploy!** Render will give you a URL like: `https://marriage-education-stripe.onrender.com`

### Option 2: Railway.app (FREE)

1. **Go to:** https://railway.app/
2. **Sign in** with GitHub
3. **New Project** → Deploy from GitHub repo
4. **Select:** `DCGit208/marriage-education-website`
5. **Add environment variables** (same as above)
6. **Deploy!** Railway gives you a URL like: `https://marriageducation-stripe.up.railway.app`

### Option 3: Heroku ($5/month)

1. **Install Heroku CLI:** `brew install heroku/brew/heroku`
2. **Login:** `heroku login`
3. **Create app:**
   ```bash
   cd /Users/achugustave/Documents/Marriageducation
   heroku create marriage-education-stripe
   ```
4. **Add environment variables:**
   ```bash
   heroku config:set STRIPE_API_KEY=sk_live_...
   heroku config:set STRIPE_WEBHOOK_SECRET=whsec_...
   heroku config:set YOUR_DOMAIN=https://marriageducation.com
   ```
5. **Deploy:**
   ```bash
   git push heroku main
   ```

## After Backend Deployment

Once deployed, you'll get a production URL (e.g., `https://marriage-education-stripe.onrender.com`). Then:

### 1. Update `checkout.js` with Production API URL

Edit `stripe/public/checkout.js`:
```javascript
const isProduction = hostname === 'marriageducation.com' || hostname === 'www.marriageducation.com';
const apiUrl = isProduction 
  ? 'https://marriage-education-stripe.onrender.com/create-checkout-session'  // YOUR DEPLOYED URL HERE
  : 'http://localhost:4242/create-checkout-session';
```

Bump version to v=8 in `stripe/public/checkout.html`:
```html
<script src="checkout.js?v=8"></script>
```

### 2. Configure Stripe Webhooks

1. **Go to:** https://dashboard.stripe.com/webhooks
2. **Click "Add endpoint"**
3. **Endpoint URL:** `https://marriage-education-stripe.onrender.com/webhooks`
4. **Select events:**
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
5. **Copy the Signing Secret** (starts with `whsec_`)
6. **Add to your hosting platform's environment variables** as `STRIPE_WEBHOOK_SECRET`

### 3. Test End-to-End

1. **CSV product:** https://marriageducation.com/payment.html?product=sbd-for-dummies
2. **Campaign SKU:** https://marriageducation.com/sbd-campaign.html → Click "Sex By Design 100"
3. Both should redirect to Stripe checkout and process payments

## What We Implemented (Stripe Best Practices ✅)

✅ **Webhooks** - `/webhooks` endpoint with signature verification  
✅ **Idempotency Keys** - Prevents duplicate charges on network retries  
✅ **Error Handling** - `Stripe::StripeError` exceptions with user-friendly messages  
✅ **Environment Variables** - `YOUR_DOMAIN` configurable for production  
✅ **Server-Side Control** - All sensitive logic (prices, products) on backend  
✅ **Dynamic Pricing** - Campaign SKUs work without pre-created Stripe Products  
✅ **Currency Handling** - FCFA→XAF mapping, zero-decimal currency support  

## Need Help?

Common issues:
- **404 on API calls:** Backend not deployed or wrong URL in `checkout.js`
- **CORS errors:** Add your domain to CORS headers in `server.rb`
- **Webhook signature fails:** Check `STRIPE_WEBHOOK_SECRET` matches Stripe Dashboard
- **"Invalid API Key":** Check `STRIPE_API_KEY` in environment variables

Current local test that works:
```bash
curl -X POST http://localhost:4242/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"product_id":"sbd-for-dummies"}' | python3 -m json.tool
```

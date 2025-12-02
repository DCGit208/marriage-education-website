# Stripe Payment Integration Setup

## Quick Start

Your Stripe integration requires a backend server to create checkout sessions securely.

### 1. Install Dependencies

```bash
cd stripe
npm install
```

### 2. Configure Stripe Keys

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Get your Stripe keys from: https://dashboard.stripe.com/apikeys

3. Edit `.env` and add your **Secret Key**:
```
STRIPE_SECRET_KEY=sk_live_YOUR_ACTUAL_SECRET_KEY
DOMAIN=http://localhost:4242
```

**Important:** 
- Use `sk_test_...` for testing
- Use `sk_live_...` for production
- NEVER commit `.env` to git (it's in .gitignore)

### 3. Update Public Key

Edit `stripe/public/checkout.js` line 2 with your **Publishable Key**:
```javascript
const stripe = Stripe("pk_live_YOUR_PUBLISHABLE_KEY");
```

### 4. Start the Server

```bash
npm start
```

Server will run on: http://localhost:4242

### 5. Test Payment

1. Open: http://localhost:4242/checkout.html?product=sbd-for-dummies&name=SBD%20for%20Dummies&price=19.99&currency=USD
2. Use Stripe test card: `4242 4242 4242 4242`
3. Any future expiry date and CVC

## Product Configuration

Edit `server.js` to add/modify products:

```javascript
const products = {
  'sbd-for-dummies': {
    name: 'SBD for Dummies',
    price: 1999, // $19.99 in cents
    currency: 'usd'
  },
  'your-new-product': {
    name: 'Your Product Name',
    price: 5000, // $50.00 in cents
    currency: 'usd'
  }
};
```

## Deployment

### Option 1: Deploy to Heroku

```bash
cd stripe
heroku create your-app-name
heroku config:set STRIPE_SECRET_KEY=sk_live_...
heroku config:set DOMAIN=https://your-app-name.herokuapp.com
git push heroku main
```

### Option 2: Deploy to Vercel/Netlify

Use serverless functions instead. See Stripe docs for Next.js/serverless examples.

### Option 3: Deploy with Main Site

If your main site has a backend (Node.js, PHP, Python, etc.), integrate the `/create-checkout-session` endpoint there.

## Troubleshooting

**Error: "An error occurred while creating the checkout session"**
- Check if server is running (`npm start`)
- Verify Stripe secret key is correct in `.env`
- Check browser console for specific error

**Error: "Invalid API key"**
- Make sure you're using the correct key (test vs live)
- Check key isn't expired
- Verify no extra spaces in `.env`

**Payment succeeds but doesn't record**
- Add webhook handler for `checkout.session.completed`
- See: https://stripe.com/docs/webhooks

## Current Status

✅ Frontend (checkout.html) - Ready
✅ Backend (server.js) - Created
⏳ Configure your Stripe keys
⏳ Install dependencies
⏳ Start server

## Next Steps

1. Run `cd stripe && npm install`
2. Configure `.env` with your keys
3. Start server: `npm start`
4. Test payment flow
5. Deploy to production

---

**Need help?** Check Stripe docs: https://stripe.com/docs/checkout/embedded/quickstart

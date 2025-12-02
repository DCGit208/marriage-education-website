require('dotenv').config();
const express = require('express');
const app = express();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Enable CORS for all origins
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.static('public'));
app.use(express.json());

// Automatically detect domain - works for both local and production
const YOUR_DOMAIN = process.env.DOMAIN || (process.env.NODE_ENV === 'production' 
  ? 'https://yourdomain.com'  // Replace with your actual domain when you know it
  : 'http://localhost:4242');

app.post('/create-checkout-session', async (req, res) => {
  try {
    const { product_id } = req.body;
    
    // Product catalog - customize these
    const products = {
      'sbd-for-dummies': {
        name: 'SBD for Dummies',
        price: 1999, // $19.99 in cents
        currency: 'usd'
      },
      'marriage-education-book': {
        name: 'Marriage Education Book',
        price: 1500000, // 15,000 FCFA in cents (XOF)
        currency: 'xof'
      }
    };

    const product = products[product_id] || products['sbd-for-dummies'];

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      line_items: [
        {
          price_data: {
            currency: product.currency,
            product_data: {
              name: product.name,
            },
            unit_amount: product.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      return_url: `${YOUR_DOMAIN}/return.html?session_id={CHECKOUT_SESSION_ID}`,
    });

    res.send({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('Error creating checkout session:', err);
    res.status(500).send({ error: err.message });
  }
});

app.get('/session-status', async (req, res) => {
  const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
  res.send({
    status: session.status,
    customer_email: session.customer_details.email
  });
});

const port = process.env.PORT || 4242;
app.listen(port, () => console.log(`Running on port ${port}`));

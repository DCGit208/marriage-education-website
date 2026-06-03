/**
 * CamPay gateway adapter — all CamPay-specific logic lives here.
 */

const crypto = require('crypto');
const axios = require('axios');
const { CAMPAY } = require('./config');

function headers() {
  const token = CAMPAY.accessToken;
  return {
    'Content-Type': 'application/json',
    Authorization: token ? `Token ${token}` : undefined
  };
}

async function loginIfNeeded() {
  if (CAMPAY.accessToken) return CAMPAY.accessToken;
  if (!CAMPAY.appUsername || !CAMPAY.appPassword) {
    return null;
  }
  const res = await axios.post(
    `${CAMPAY.apiBase}/token/`,
    { username: CAMPAY.appUsername, password: CAMPAY.appPassword },
    { timeout: 30000 }
  );
  return res.data?.token || null;
}

/**
 * @param {{ amount: number, currency?: string, externalReference: string, phone?: string, description?: string }} params
 */
async function processPayment(params) {
  const {
    amount,
    currency = 'XAF',
    externalReference,
    phone,
    description = 'SBD Network payment'
  } = params;

  if (CAMPAY.testMode && !CAMPAY.accessToken && !CAMPAY.appUsername) {
    return {
      gateway: 'campay',
      mode: 'sandbox_simulated',
      gatewayReference: `CAMPAY-SIM-${externalReference}`,
      status: 'PENDING',
      checkoutUrl: null,
      raw: { simulated: true, message: 'Configure campay.* in functions config for live requests' }
    };
  }

  const token = await loginIfNeeded();
  const payload = {
    amount: String(amount),
    currency,
    from: phone || undefined,
    description,
    external_reference: externalReference
  };

  const res = await axios.post(`${CAMPAY.apiBase}/collect/`, payload, {
    headers: { ...headers(), Authorization: token ? `Token ${token}` : headers().Authorization },
    timeout: 30000
  });

  return {
    gateway: 'campay',
    mode: CAMPAY.testMode ? 'test' : 'live',
    gatewayReference: res.data?.reference || res.data?.uuid || externalReference,
    status: mapCampayStatus(res.data?.status),
    checkoutUrl: res.data?.payment_url || null,
    raw: res.data
  };
}

async function verifyPayment({ gatewayReference }) {
  if (CAMPAY.testMode && String(gatewayReference).startsWith('CAMPAY-SIM-')) {
    return {
      gateway: 'campay',
      gatewayReference,
      status: 'SUCCESS',
      verified: true,
      raw: { simulated: true }
    };
  }

  const token = await loginIfNeeded();
  const res = await axios.get(`${CAMPAY.apiBase}/transaction/${gatewayReference}/`, {
    headers: { ...headers(), Authorization: token ? `Token ${token}` : headers().Authorization },
    timeout: 30000
  });

  return {
    gateway: 'campay',
    gatewayReference,
    status: mapCampayStatus(res.data?.status),
    verified: mapCampayStatus(res.data?.status) === 'SUCCESS',
    raw: res.data
  };
}

async function processPayout({ amount, currency = 'XAF', momoNumber, externalReference }) {
  if (CAMPAY.testMode && !CAMPAY.accessToken && !CAMPAY.appUsername) {
    return {
      gateway: 'campay',
      mode: 'sandbox_simulated',
      gatewayReference: `CAMPAY-PAYOUT-SIM-${externalReference}`,
      status: 'SUCCESS',
      raw: { simulated: true }
    };
  }

  const token = await loginIfNeeded();
  const res = await axios.post(
    `${CAMPAY.apiBase}/withdraw/`,
    {
      amount: String(amount),
      currency,
      to: momoNumber,
      external_reference: externalReference
    },
    {
      headers: { ...headers(), Authorization: token ? `Token ${token}` : headers().Authorization },
      timeout: 30000
    }
  );

  return {
    gateway: 'campay',
    gatewayReference: res.data?.reference || res.data?.uuid || externalReference,
    status: mapCampayStatus(res.data?.status),
    raw: res.data
  };
}

function verifyWebhook({ headers: reqHeaders, rawBody }) {
  const secret = CAMPAY.webhookSecret;
  if (!secret) {
    if (CAMPAY.testMode) {
      return { valid: true, mode: 'sandbox_no_secret' };
    }
    return { valid: false, error: 'CAMPAY_WEBHOOK_SECRET not configured' };
  }

  const signature =
    reqHeaders['x-campay-signature'] ||
    reqHeaders['x-signature'] ||
    reqHeaders['campay-signature'];

  if (!signature) {
    return { valid: false, error: 'Missing webhook signature' };
  }

  const body = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {});
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  const valid =
    signature === expected ||
    signature === `sha256=${expected}`;

  return { valid, mode: 'hmac_sha256' };
}

function parseWebhook({ body }) {
  const data = typeof body === 'string' ? JSON.parse(body) : body;
  return {
    gateway: 'campay',
    gatewayReference: data.reference || data.external_reference || data.uuid,
    externalReference: data.external_reference,
    status: mapCampayStatus(data.status),
    amount: Number(data.amount || 0),
    currency: data.currency || 'XAF',
    raw: data
  };
}

function mapCampayStatus(status) {
  const s = String(status || '').toUpperCase();
  if (['SUCCESSFUL', 'SUCCESS', 'COMPLETED', 'COMPLETE'].includes(s)) return 'SUCCESS';
  if (['FAILED', 'CANCELLED', 'CANCELED', 'ERROR'].includes(s)) return 'FAILED';
  return 'PENDING';
}

module.exports = {
  processPayment,
  verifyPayment,
  processPayout,
  verifyWebhook,
  parseWebhook
};

/**
 * Commerce OS Tier 2 — production CamPay config (isolated from commerce_v1 sandbox).
 */
const functions = require('firebase-functions');

function cfg(path, fallback = '') {
  const parts = path.split('.');
  let cur = functions.config();
  for (const p of parts) {
    if (!cur || cur[p] === undefined) return fallback;
    cur = cur[p];
  }
  return cur || fallback;
}

/** commerce_v1 sandbox — must stay true until explicit cutover of that UI */
const COMMERCE_V1_SANDBOX = cfg('commerce.sandbox_mode', 'true') !== 'false';

/** Tier 2 live CamPay collect/disburse for Cameroon */
const CAMPAY_LIVE_ENABLED = cfg('commerce.campay_live_enabled', 'false') === 'true';

const CAMPAY_AUTO_FULFILL = cfg('commerce.campay_auto_fulfill', 'true') !== 'false';

const PILOT_PRODUCT_TYPES = (cfg('commerce.campay_pilot_products', 'ambassador_registration') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const CAMPAY = {
  appId: cfg('campay.app_id'),
  appUsername: cfg('campay.app_username'),
  appPassword: cfg('campay.app_password'),
  accessToken: cfg('campay.access_token'),
  webhookSecret: cfg('campay.webhook_secret'),
  apiBase: cfg('campay.api_base', CAMPAY_LIVE_ENABLED ? 'https://www.campay.net/api' : 'https://demo.campay.net/api'),
  testMode: !CAMPAY_LIVE_ENABLED
};

const COLLECTIONS = {
  campayPayments: 'campay_payments',
  webhookLogs: 'campay_webhook_logs'
};

const TIER2_POLICY_VERSION = '2026-05-tier2-v1';

module.exports = {
  COMMERCE_V1_SANDBOX,
  CAMPAY_LIVE_ENABLED,
  CAMPAY_AUTO_FULFILL,
  PILOT_PRODUCT_TYPES,
  CAMPAY,
  COLLECTIONS,
  TIER2_POLICY_VERSION
};

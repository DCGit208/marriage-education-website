/**
 * CamPay gateway — collect & disburse (wraps commerce/campayAdapter with Tier 2 config).
 */
const campayAdapter = require('../../commerce/campayAdapter');
const { CAMPAY, CAMPAY_LIVE_ENABLED } = require('../config');

function hasCredentials() {
  return !!(CAMPAY.accessToken || (CAMPAY.appUsername && CAMPAY.appPassword));
}

async function collectPayment(params) {
  if (!CAMPAY_LIVE_ENABLED && !hasCredentials()) {
    return campayAdapter.processPayment(params);
  }
  return campayAdapter.processPayment(params);
}

async function disbursePayment(params) {
  return campayAdapter.processPayout(params);
}

function verifyWebhook(headers, rawBody) {
  return campayAdapter.verifyWebhook({ headers, rawBody });
}

function parseWebhook(body) {
  return campayAdapter.parseWebhook({ body });
}

async function verifyTransaction(gatewayReference) {
  return campayAdapter.verifyPayment({ gatewayReference });
}

module.exports = {
  collectPayment,
  disbursePayment,
  verifyWebhook,
  parseWebhook,
  verifyTransaction,
  hasCredentials,
  CAMPAY_LIVE_ENABLED
};

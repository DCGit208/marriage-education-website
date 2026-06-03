/**
 * Payment abstraction layer — gateway-agnostic entry points.
 */

const campayAdapter = require('./campayAdapter');

const gateways = {
  campay: campayAdapter
};

function getGateway(name) {
  const gateway = gateways[name];
  if (!gateway) {
    throw new Error(`Unknown payment gateway: ${name}`);
  }
  return gateway;
}

/**
 * Initiate a customer payment (collection).
 */
async function processPayment(params) {
  const gateway = getGateway(params.gateway || 'campay');
  return gateway.processPayment(params);
}

/**
 * Verify payment status with gateway.
 */
async function verifyPayment(params) {
  const gateway = getGateway(params.gateway || 'campay');
  return gateway.verifyPayment(params);
}

/**
 * Send disbursement / payout to MoMo.
 */
async function processPayout(params) {
  const gateway = getGateway(params.gateway || 'campay');
  return gateway.processPayout(params);
}

/**
 * Verify inbound webhook authenticity.
 */
async function verifyWebhook(params) {
  const gateway = getGateway(params.gateway || 'campay');
  return gateway.verifyWebhook(params);
}

/**
 * Normalize webhook payload to internal event shape.
 */
async function parseWebhook(params) {
  const gateway = getGateway(params.gateway || 'campay');
  return gateway.parseWebhook(params);
}

module.exports = {
  processPayment,
  verifyPayment,
  processPayout,
  verifyWebhook,
  parseWebhook,
  getGateway
};

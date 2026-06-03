/**
 * Commerce Engine V1 — configuration (sandbox-first).
 * Secrets via Firebase Functions config only — never frontend.
 *
 * firebase functions:config:set commerce.sandbox_mode="true" \
 *   campay.app_id="..." campay.app_username="..." campay.app_password="..." \
 *   campay.access_token="..." campay.webhook_secret="..."
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

const SANDBOX_MODE = cfg('commerce.sandbox_mode', 'true') !== 'false';

/** Collection names — prefixed in sandbox to avoid production collisions */
const COLLECTIONS = SANDBOX_MODE
  ? {
      transactions: 'commerce_v1_transactions',
      commissions: 'commerce_v1_commissions',
      wallets: 'commerce_v1_wallets',
      payouts: 'commerce_v1_payouts',
      webhookLogs: 'commerce_v1_webhook_logs',
      accessGrants: 'commerce_v1_access_grants'
    }
  : {
      transactions: 'transactions',
      commissions: 'commissions',
      wallets: 'wallets',
      payouts: 'payouts',
      webhookLogs: 'webhook_logs',
      accessGrants: 'access_grants'
    };

const CAMPAY = {
  appId: cfg('campay.app_id'),
  appUsername: cfg('campay.app_username'),
  appPassword: cfg('campay.app_password'),
  accessToken: cfg('campay.access_token'),
  webhookSecret: cfg('campay.webhook_secret'),
  /** CamPay API base — override for sandbox */
  apiBase: cfg('campay.api_base', 'https://demo.campay.net/api'),
  testMode: SANDBOX_MODE || cfg('campay.test_mode', 'true') === 'true'
};

const COMMISSION_RULES = {
  foundation_subscription: {
    label: 'Foundation Subscription',
    totalFCFA: 5200,
    commissionableFCFA: 5000,
    opexFCFA: 200,
    roles: {
      ambassador: { percentOfCommissionable: 0.1, amountFCFA: 500 },
      senior_ambassador: { percentOfCommissionable: 0.05, amountFCFA: 250 }
    }
  },
  book_purchase: {
    label: 'Book Purchase',
    commissionableFCFA: 5000,
    roles: {
      ambassador: { percentOfCommissionable: 0.1, amountFCFA: 500 },
      senior_ambassador: { percentOfCommissionable: 0.05, amountFCFA: 250 }
    }
  }
};

const ACCESS_RULES = {
  book_purchase: {
    formationAccessDays: 60,
    permanentReader: true,
    unlockCourseware: true
  },
  foundation_subscription: {
    formationAccessDays: 60,
    permanentReader: false,
    unlockCourseware: true,
    subscriptionTier: 'foundation'
  }
};

const TX_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED'
});

const COMMISSION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAID: 'PAID'
});

const PAYOUT_STATUS = Object.freeze({
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  RETRY: 'RETRY'
});

module.exports = {
  SANDBOX_MODE,
  COLLECTIONS,
  CAMPAY,
  COMMISSION_RULES,
  ACCESS_RULES,
  TX_STATUS,
  COMMISSION_STATUS,
  PAYOUT_STATUS
};

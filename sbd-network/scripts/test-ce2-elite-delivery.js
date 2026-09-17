/**
 * Unit tests for CE2 Elite receive + bubble delivery states.
 * Usage: node scripts/test-ce2-elite-delivery.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const perms = require(path.join(ROOT, 'functions/messaging/permissions.js'));

function loadIife(relPath, extras) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const sandbox = Object.assign(
    {
      console: console,
      Date: Date,
      Number: Number,
      String: String,
      Math: Math,
      Array: Array,
      Object: Object,
      Error: Error,
    },
    extras || {}
  );
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(code, sandbox, { filename: relPath });
  return sandbox;
}

function futureEnd(days) {
  return { seconds: Math.floor(Date.now() / 1000) + days * 86400 };
}

function ts(secondsAgo) {
  return { seconds: Math.floor(Date.now() / 1000) - secondsAgo };
}

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ok  ' + name);
  } catch (err) {
    failed += 1;
    console.error('  FAIL  ' + name);
    console.error('       ' + (err && err.stack ? err.stack.split('\n')[0] : err));
  }
}

console.log('\nCE2 Elite receive (stale users.tier)\n');
const gov = loadIife('public/communication-v2/ce2-governance.js').Ce2Governance;
assert.ok(gov, 'Ce2Governance did not load');

const eliteBilling = {
  tier: 'premium',
  subscription: { status: 'active', tier: 'elite', endDate: futureEnd(30) },
};

test('hasEliteMessagingAccess is true when only subscription.tier is elite', function () {
  assert.strictEqual(gov.hasEliteMessagingAccess(eliteBilling), true);
  assert.strictEqual(gov.canReadClassificationAsUser(eliteBilling, 'elite'), true);
});

test('stale foundation users.tier still reads Elite classification via billing', function () {
  const u = {
    tier: 'foundation',
    subscription: { status: 'active', tier: 'elite', endDate: futureEnd(30) },
  };
  assert.strictEqual(gov.canReadClassificationAsUser(u, 'elite'), true);
  assert.strictEqual(gov.canReadClassificationAsUser(u, 'premium'), true);
});

test('premium without Elite billing cannot read Elite classification', function () {
  assert.strictEqual(
    gov.canReadClassificationAsUser({ tier: 'premium' }, 'elite'),
    false
  );
});

test('trialing Elite subscription counts as active billing', function () {
  const u = {
    tier: 'premium',
    subscription: { status: 'trialing', tier: 'elite', endDate: futureEnd(14) },
  };
  assert.strictEqual(gov.resolveMessagingTier(u), 'elite');
  assert.strictEqual(gov.hasEliteMessagingAccess(u), true);
});

test('stale stored DM floor (premium) should raise to live Elite min', function () {
  assert.strictEqual(gov.shouldRaiseConversationSecurity(1, 2), true);
  assert.strictEqual(gov.shouldRaiseConversationSecurity(2, 2), false);
  assert.strictEqual(gov.shouldRaiseConversationSecurity(2, 1), false);
  assert.strictEqual(gov.shouldRaiseConversationSecurity(-1, 2), true);
});

test('permissions.js matches raise-floor helper', function () {
  assert.strictEqual(perms.shouldRaiseConversationSecurity(1, 2), true);
  const user = perms.userFromDoc('e', eliteBilling);
  assert.strictEqual(user.tier, 'elite');
});

test('read eligibility ignores conversation floor (send-side only)', function () {
  // Elite-classified message is visible to Elite billing even if stored floor is 1.
  assert.strictEqual(gov.canReadClassificationAsUser(eliteBilling, 'elite'), true);
  assert.strictEqual(gov.classificationAllowedAtFloor('elite', 1), false);
});

console.log('\nCE2 bubble delivery states\n');
const receipts = loadIife('public/communication-v2/ce2-receipts.js').Ce2Receipts;
assert.ok(receipts, 'Ce2Receipts did not load');

const selfUid = 'me';
function msg(extra) {
  return Object.assign(
    {
      senderId: selfUid,
      createdAt: ts(10),
    },
    extra || {}
  );
}

test('pending optimistic bubble is Sending…', function () {
  assert.strictEqual(receipts.deliveryStatus(msg({ _pending: true }), selfUid), 'pending');
  assert.strictEqual(receipts.statusLabel('pending'), 'Sending…');
});

test('confirmed write without peer activity is Sent (not Delivered)', function () {
  assert.strictEqual(receipts.deliveryStatus(msg(), selfUid, null), 'sent');
  assert.strictEqual(receipts.statusLabel('sent'), 'Sent');
});

test('peer online after send is Delivered', function () {
  assert.strictEqual(
    receipts.deliveryStatus(msg(), selfUid, null, { otherOnline: true }),
    'delivered'
  );
  assert.strictEqual(receipts.statusLabel('delivered'), 'Delivered');
});

test('peer lastActive after createdAt is Delivered', function () {
  const m = msg({ createdAt: ts(30) });
  const activeMs = Date.now() - 5000;
  assert.strictEqual(
    receipts.deliveryStatus(m, selfUid, null, { otherLastActiveMs: activeMs }),
    'delivered'
  );
});

test('peer lastRead after createdAt is Read', function () {
  assert.strictEqual(receipts.deliveryStatus(msg(), selfUid, ts(0)), 'read');
  assert.strictEqual(receipts.statusLabel('read'), 'Read');
});

test('failed bubble is Failed to send and beats pending', function () {
  assert.strictEqual(
    receipts.deliveryStatus(msg({ _pending: true, _failed: true }), selfUid),
    'failed'
  );
  assert.strictEqual(
    receipts.deliveryStatus(msg({ uploadState: 'failed' }), selfUid),
    'failed'
  );
  assert.strictEqual(receipts.statusLabel('failed'), 'Failed to send');
});

test('incoming (other sender) has no status', function () {
  assert.strictEqual(receipts.deliveryStatus(msg({ senderId: 'them' }), selfUid), '');
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 Elite delivery tests passed\n');

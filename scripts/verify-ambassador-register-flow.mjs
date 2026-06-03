/**
 * Flow verification without browser (disk-safe).
 * Run: node scripts/verify-ambassador-register-flow.mjs
 */
import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5003';
const require = createRequire(import.meta.url);

const results = [];
const pass = (n, d = '') => { results.push({ ok: true, n, d }); console.log(`✅ ${n}${d ? ` — ${d}` : ''}`); };
const fail = (n, d = '') => { results.push({ ok: false, n, d }); console.error(`❌ ${n}${d ? ` — ${d}` : ''}`); };

// --- 1. Load intl + referral-code modules in fake browser global ---
global.window = global;
const intlPath = new URL('../public/js/ambassador-register-intl.js', import.meta.url);
await import(intlPath.href);
const refPath = new URL('../public/js/ambassador-referral-code.js', import.meta.url);
await import(refPath.href);
const I = global.AmbassadorRegisterIntl;
const R = global.MEAmbassadorReferralCode;

if (I) pass('ambassador-register-intl.js loads');
else fail('ambassador-register-intl.js loads');

if (I.getPaymentConfig('CM').currency === 'XAF') pass('Cameroon payment config');
else fail('Cameroon payment config');

if (I.getPaymentConfig('US').currency === 'USD' && I.getPaymentConfig('US').amount === 30) pass('US payment config');
else fail('US payment config');

if (I.buildPhoneE164('CM', '670123456') === '+237670123456') pass('CM phone E.164');
else fail('CM phone E.164', I.buildPhoneE164('CM', '670123456'));

if (I.buildPhoneE164('US', '5551234567') === '+15551234567') pass('US phone E.164');
else fail('US phone E.164', I.buildPhoneE164('US', '5551234567'));

if (I.buildPhoneE164('OTHER', '+44 7700 900123') === '+447700900123') pass('OTHER phone E.164');
else fail('OTHER phone E.164', I.buildPhoneE164('OTHER', '+44 7700 900123'));

if (R) pass('ambassador-referral-code.js loads');
else fail('ambassador-referral-code.js loads');

if (R.normalizeReferralCode('AMB_KONI_8321') === 'AMB-KONI-8321') pass('Normalize underscore recruiter code');
else fail('Normalize underscore recruiter code', R.normalizeReferralCode('AMB_KONI_8321'));

if (R.normalizeReferralCode('rd-gust-4230') === 'RD-GUST-4230') pass('Normalize lowercase RD code');
else fail('Normalize lowercase RD code');

const applied = R.applyRecruiterToAmbassadorData({}, 'AMB_KONI_8321');
if (applied.recruitedBy === 'AMB-KONI-8321' && applied.senior_code === 'AMB-KONI-8321') {
  pass('applyRecruiterToAmbassadorData for AMB');
} else fail('applyRecruiterToAmbassadorData for AMB');

// --- 2. Simulate registration submit logic (from ambassador-register.html) ---
function simulateSubmit(form, sessionReferral = null) {
  const countryCode = form.country || 'CM';
  const pay = I.getPaymentConfig(countryCode);
  const countryMeta = I.getCountryMeta(countryCode);
  const region = I.isCameroon(countryCode) ? form.regionCameroon : (form.regionIntl || '').trim();
  const phone = I.buildPhoneE164(countryCode, form.phoneLocal || '');
  const referralCode = R.normalizeReferralCode(form.recruitedBy || sessionReferral || '');
  const referralType = form.referralType || (referralCode.startsWith('RD-') ? 'regional_director' : 'senior_ambassador');

  let seniorAmbassador = null;
  let regionalDirector = null;
  if (referralCode.startsWith('RD-')) regionalDirector = referralCode;
  else if (referralCode.startsWith('AMB-')) seniorAmbassador = referralCode;

  const ambCode = 'AMB-TEST-' + Date.now().toString().slice(-4);
  const session = {
    ...form,
    code: ambCode,
    country: countryCode,
    countryName: countryMeta.name,
    phoneE164: phone,
    currency: pay.currency,
    entryAmount: pay.amount,
    paymentMethod: pay.method,
    region,
    recruitedBy: referralCode,
    recruited_by_type: referralType,
    senior_code: seniorAmbassador,
    regional_director_code: regionalDirector,
  };

  let paymentUrl = `ambassador-payment.html?code=${encodeURIComponent(ambCode)}`
    + `&amount=${pay.amount}&currency=${pay.currency}&country=${countryCode}`;
  if (referralCode) paymentUrl += `&ref=${encodeURIComponent(referralCode)}`;

  return { session, paymentUrl, pay, region, phone };
}

const cmNoRef = simulateSubmit({
  country: 'CM', regionCameroon: 'Littoral', phoneLocal: '670123456', recruitedBy: '',
});
if (!cmNoRef.session.recruitedBy && cmNoRef.pay.method === 'momo') pass('CM submit without recruiter → MoMo');
else fail('CM submit without recruiter');

const usWithAmb = simulateSubmit({
  country: 'US', regionIntl: 'Texas', phoneLocal: '5551234567', recruitedBy: 'AMB-JANE-4321',
});
if (usWithAmb.session.senior_code === 'AMB-JANE-4321' && usWithAmb.paymentUrl.includes('ref=AMB-JANE-4321')) {
  pass('US submit with AMB recruiter → ref in URL + senior_code');
} else fail('US submit with AMB recruiter');

const rdRef = simulateSubmit({
  country: 'CM', regionCameroon: 'Centre', phoneLocal: '690000000', recruitedBy: 'RD-REG-9999',
});
if (rdRef.session.regional_director_code === 'RD-REG-9999') pass('RD recruiter → regional_director_code');
else fail('RD recruiter');

const underscoreAmb = simulateSubmit({
  country: 'CM', regionCameroon: 'Littoral', phoneLocal: '670123456', recruitedBy: 'AMB_KONI_8321',
});
if (underscoreAmb.session.recruitedBy === 'AMB-KONI-8321' && underscoreAmb.session.senior_code === 'AMB-KONI-8321') {
  pass('Underscore recruiter normalized at submit');
} else fail('Underscore recruiter normalized at submit');

// --- 3. Simulate payment page resolvePaymentContext ---
function resolvePaymentContext(urlParams, session) {
  const urlCurrency = (urlParams.currency || '').toUpperCase();
  const urlCountry = (urlParams.country || '').toUpperCase();
  const urlAmount = urlParams.amount;
  const country = urlCountry || session?.country || 'CM';
  const currency = urlCurrency || session?.currency || (country === 'CM' ? 'XAF' : 'USD');
  const isCameroon = country === 'CM' || currency === 'XAF';
  let amount, priceLabel;
  if (isCameroon) {
    amount = parseInt(urlAmount, 10) || session?.entryAmount || 15000;
    priceLabel = amount.toLocaleString() + ' FCFA';
  } else {
    amount = parseInt(urlAmount, 10) || session?.entryAmount || 30;
    priceLabel = '$' + amount + ' USD';
  }
  return { country, currency, amount, priceLabel, isCameroon, session };
}

const payCtxIntl = resolvePaymentContext(
  { currency: 'USD', country: 'US', amount: '30' },
  null
);
if (!payCtxIntl.isCameroon && payCtxIntl.priceLabel === '$30 USD') pass('Payment page URL-only intl context');
else fail('Payment page URL-only intl context');

// MoMo recruitedBy merge (from payment page submit handler)
function mergeRecruitedBy(ambassadorData, urlRef) {
  if (urlRef && (!ambassadorData || !ambassadorData.recruitedBy)) {
    ambassadorData = ambassadorData || {};
    ambassadorData.recruitedBy = urlRef;
    if (urlRef.startsWith('RD-')) ambassadorData.regional_director_code = urlRef;
    else if (urlRef.startsWith('AMB-')) ambassadorData.senior_code = urlRef;
  }
  return ambassadorData?.regional_director_code || ambassadorData?.recruitedBy || urlRef || '';
}

if (mergeRecruitedBy(null, 'AMB-JANE-4321') === 'AMB-JANE-4321') pass('Payment MoMo: ref restored from URL when session empty');
else fail('Payment MoMo: ref restored from URL');

if (mergeRecruitedBy({ recruitedBy: 'RD-X-1' }, 'AMB-OTHER') === 'RD-X-1') pass('Payment MoMo: session recruiter wins over URL');
else fail('Payment MoMo: session recruiter priority');

// --- 4. Fetch live pages from emulator ---
async function fetchOk(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'follow' });
  return { status: res.status, html: await res.text(), url: res.url };
}

try {
  const reg = await fetchOk('/ambassador-register');
  if (reg.status === 200) pass('Register page loads', reg.url);
  else fail('Register page loads', String(reg.status));

  if (reg.html.includes('ambassador-register-intl.js')) pass('Register page includes intl script');
  else fail('Register page includes intl script');

  if (reg.html.includes('ambassador-referral-code.js')) pass('Register page includes referral-code script');
  else fail('Register page includes referral-code script');

  if (reg.html.includes('name="recruitedBy"')) pass('Recruited by field present');
  else fail('Recruited by field present');

  if (reg.html.includes('id="countrySelect"')) pass('Country select present');
  else fail('Country select present');

  if (reg.html.includes('getElementById(\'ambassadorForm\')')) pass('Form submit handler present');
  else fail('Form submit handler present');

  const pay = await fetchOk('/ambassador-payment?code=AMB-TEST&amount=30&currency=USD&country=US&ref=AMB-X');
  if (pay.status === 200) pass('Payment page loads with intl params');
  else fail('Payment page loads');

  if (pay.html.includes('resolvePaymentContext')) pass('Payment resolvePaymentContext present');
  else fail('Payment resolvePaymentContext');

  if (pay.html.includes("selectPaymentMethod('stripe'")) pass('Stripe auto-select for intl');
  else fail('Stripe auto-select for intl');

  if (pay.html.includes("getElementById('btn-pay-momo').style.display = 'none'")) {
    pass('MoMo hidden for international');
  } else fail('MoMo hidden for intl');

  const pending = await fetchOk('/payment-pending.html');
  if (pending.status === 200) pass('payment-pending.html exists (MoMo success path)');
  else fail('payment-pending.html');

  const stripeConfirm = await fetchOk('/ambassador/stripe-confirmation.html');
  if (stripeConfirm.status === 200) pass('stripe-confirmation.html exists (Stripe success path)');
  else fail('stripe-confirmation.html');

} catch (e) {
  fail('HTTP checks', e.message);
}

// --- 5. Known gaps (document as warnings) ---
console.log('\n⚠️  Manual / browser checks still recommended:');
console.log('   • Apply tab is not default — user lands on Overview until they click Apply or #apply');
console.log('   • Recruiter codes are normalized (underscores→hyphens); invalid/fake codes are not verified against Firestore on signup');
console.log('   • Full payment submit requires live Firebase (not emulated locally)');
console.log('   • Direct visit to #apply in URL does not auto-open Apply tab (only click handlers)');

const failed = results.filter((r) => !r.ok);
console.log(`\n--- ${results.length - failed.length}/${results.length} automated checks passed ---`);
process.exit(failed.length ? 1 : 0);

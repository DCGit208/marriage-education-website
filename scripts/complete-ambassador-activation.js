/**
 * Re-run ambassador activation for an approved payment (recovery).
 * Requires reprocessAmbassadorActivation deployed.
 *
 * Usage:
 *   node scripts/complete-ambassador-activation.js AMB-ACHA-0252
 */

const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const path = require('path');

async function main() {
  const reference = process.argv[2];
  if (!reference) {
    console.error('Usage: node scripts/complete-ambassador-activation.js <reference>');
    process.exit(1);
  }

  const auth = new GoogleAuth({
    keyFile: path.join(__dirname, '../serviceAccountKey.json'),
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const headers = await client.getRequestHeaders();

  const url =
    'https://us-central1-marriage-education.cloudfunctions.net/reprocessAmbassadorActivationHttp';

  console.log('Calling', url, 'for', reference);
  const res = await axios.post(
    url,
    { data: { reference } },
    { headers, timeout: 120000 }
  );

  console.log('✅ Result:', JSON.stringify(res.data, null, 2));
}

main().catch((err) => {
  const data = err.response?.data;
  console.error('❌ Failed:', data || err.message);
  process.exit(1);
});

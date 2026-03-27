#!/usr/bin/env node
// Sets the correct CORS policy on the sbd-media R2 bucket via the S3 API
// Run: node scripts/set-r2-cors.js

const fs   = require('fs');
const path = require('path');

// Load .env manually (no dotenv dependency needed)
const envFile = path.join(__dirname, '.env');
fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim();
});

const { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } = require('@aws-sdk/client-s3');

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.R2_SECRET_KEY;
const BUCKET     = process.env.R2_BUCKET;

if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY || !BUCKET) {
  console.error('Missing R2 env vars. Check scripts/.env');
  process.exit(1);
}

const client = new S3Client({
  region:   'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  forcePathStyle: true,
});

async function main() {
  console.log(`Setting CORS on bucket: ${BUCKET}`);

  await client.send(new PutBucketCorsCommand({
    Bucket: BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: ['https://marriage-education.web.app'],
          AllowedMethods: ['PUT', 'GET', 'HEAD'],
          AllowedHeaders: ['*'],
          ExposeHeaders:  ['ETag'],
          MaxAgeSeconds:  3600,
        },
      ],
    },
  }));

  console.log('✅ CORS written. Verifying...');

  const result = await client.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
  console.log('Current CORS rules:');
  console.log(JSON.stringify(result.CORSRules, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });

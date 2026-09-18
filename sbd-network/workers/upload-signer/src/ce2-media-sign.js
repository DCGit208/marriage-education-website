/**
 * Short-lived HMAC signatures for CE2 private media GET URLs.
 * Shared by the Worker and Node tests.
 */

export const CE2_MEDIA_TTL_SEC = 600;

function b64urlBuf(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function timingSafeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

export function mediaSignPayload(objectKey, exp) {
  return `GET\n${objectKey}\n${exp}`;
}

export function getMediaSigningSecret(env) {
  return String((env && (env.MEDIA_SIGNING_SECRET || env.SA_PRIVATE_KEY)) || '');
}

export async function hmacSign(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(message || '')));
  return b64urlBuf(sig);
}

export async function signMediaKey(secret, objectKey, exp) {
  return hmacSign(secret, mediaSignPayload(objectKey, exp));
}

export async function verifyMediaSig(secret, objectKey, exp, sig) {
  if (!secret || !objectKey || !exp || !sig) return false;
  const expected = await signMediaKey(secret, objectKey, exp);
  return timingSafeEqual(expected, String(sig));
}

export function mediaExpiryUnix(nowMs, ttlSec) {
  const now = Math.floor((nowMs || Date.now()) / 1000);
  return now + (ttlSec || CE2_MEDIA_TTL_SEC);
}

export function isMediaExpiryValid(exp, nowMs, skewSec) {
  const n = Number(exp);
  if (!Number.isFinite(n) || n <= 0) return false;
  const now = Math.floor((nowMs || Date.now()) / 1000);
  const skew = skewSec == null ? 30 : skewSec;
  if (n > now + (CE2_MEDIA_TTL_SEC + skew)) return false;
  return n + skew >= now;
}

export function signedMediaPath(objectKey, exp, sig) {
  const params = new URLSearchParams();
  params.set('key', objectKey);
  params.set('exp', String(exp));
  params.set('sig', sig);
  return `/media?${params.toString()}`;
}

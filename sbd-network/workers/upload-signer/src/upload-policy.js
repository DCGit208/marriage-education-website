/**
 * Shared upload allow-list helpers (Cloudflare Worker + Node tests).
 */

export function stripContentTypeParams(contentType) {
  return String(contentType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
}

function hostnameFromOrigin(origin) {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch (_) {
    return '';
  }
}

export function isTrustedUploadOrigin(origin, corsOriginEnv) {
  if (!origin) return false;
  const allowed = String(corsOriginEnv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.includes(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  const host = hostnameFromOrigin(origin);
  if (!host) return false;
  if (host === 'marriageducation.com' || host.endsWith('.marriageducation.com')) return true;
  if (host === 'sbd-network.web.app' || host === 'sbd-network.firebaseapp.com') return true;
  if (host === 'marriage-education.web.app' || host === 'marriage-education.firebaseapp.com') {
    return true;
  }
  return false;
}

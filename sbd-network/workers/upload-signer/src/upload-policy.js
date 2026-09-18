/**
 * Shared upload allow-list helpers (Cloudflare Worker + Node tests).
 */

export const ALLOWED_FOLDERS = [
  'ugc-photos',
  'ugc-videos',
  'dm_attachments',
  'dm_videos',
  'dm_audio',
  'course-covers',
];

export const CE2_DM_FOLDERS = ['dm_attachments', 'dm_videos', 'dm_audio'];

export function stripContentTypeParams(contentType) {
  return String(contentType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
}

export function isSafeUploadScopeId(scopeId) {
  return /^[A-Za-z0-9._-]{1,128}$/.test(String(scopeId || ''));
}

/**
 * R2 keys stay public CDN URLs. Conversation-scoped folders organize objects
 * (`dm_attachments/{convOrGroupId}/file`) but do not restrict who can fetch
 * them. Firebase Storage is what membership-locks reads.
 *
 * Bare `dm_attachments` (no scope) remains valid for legacy / non-CE2 uploads.
 */
export function isAllowedUploadFolder(folder) {
  const raw = String(folder || '');
  if (ALLOWED_FOLDERS.indexOf(raw) >= 0) return true;
  const parts = raw.split('/');
  return (
    parts.length === 2 &&
    CE2_DM_FOLDERS.indexOf(parts[0]) >= 0 &&
    isSafeUploadScopeId(parts[1])
  );
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

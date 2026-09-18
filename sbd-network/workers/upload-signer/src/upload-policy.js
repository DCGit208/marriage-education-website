/**
 * Shared upload allow-list helpers (Cloudflare Worker + Node tests).
 *
 * Mix modes in one Worker:
 *   - ugc-photos, ugc-videos, course-covers, and bare dm_* (legacy /dm.js)
 *     still land on the public sbd-media CDN (r2.dev).
 *   - Conversation-scoped CE2 folders (dm_attachments|{dm_videos|dm_audio}/{convId})
 *     write under the private prefix `ce2/` and MUST NOT return a publicUrl.
 *     Clients resolve a short-lived signed GET (or Worker proxy) at play/view time.
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

export const CE2_PRIVATE_PREFIX = 'ce2';

export const PUBLIC_UPLOAD_FOLDERS = ['ugc-photos', 'ugc-videos', 'course-covers'];

export function stripContentTypeParams(contentType) {
  return String(contentType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
}

export function isSafeUploadScopeId(scopeId) {
  return /^[A-Za-z0-9._-]{1,128}$/.test(String(scopeId || ''));
}

export function isSafeObjectFilename(filename) {
  const raw = String(filename || '');
  return /^[A-Za-z0-9._-]{1,180}$/.test(raw) && raw.indexOf('..') < 0;
}

/**
 * Bare `dm_attachments` (no scope) remains valid for legacy / non-CE2 uploads
 * and stays on the public CDN. Scoped `dm_attachments/{convId}` is CE2 private.
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

export function isCe2PrivateUploadFolder(folder) {
  const parts = String(folder || '').split('/');
  return (
    parts.length === 2 &&
    CE2_DM_FOLDERS.indexOf(parts[0]) >= 0 &&
    isSafeUploadScopeId(parts[1])
  );
}

export function ce2PrivateObjectKey(folder, filename) {
  const folderPath = String(folder || '').replace(/^\/+|\/+$/g, '');
  const safeName = String(filename || '');
  if (!isCe2PrivateUploadFolder(folderPath) || !isSafeObjectFilename(safeName)) return '';
  return `${CE2_PRIVATE_PREFIX}/${folderPath}/${safeName}`;
}

export function parseCe2PrivateObjectKey(key) {
  const raw = String(key || '')
    .replace(/^\/+/, '')
    .split('?')[0];
  if (!raw || raw.indexOf('..') >= 0 || raw.indexOf('\\') >= 0) return null;
  const parts = raw.split('/').filter(Boolean);
  if (
    parts.length !== 4 ||
    parts[0] !== CE2_PRIVATE_PREFIX ||
    CE2_DM_FOLDERS.indexOf(parts[1]) < 0 ||
    !isSafeUploadScopeId(parts[2]) ||
    !isSafeObjectFilename(parts[3])
  ) {
    return null;
  }
  return {
    key: parts.join('/'),
    prefix: parts[0],
    folder: parts[1],
    scopeId: parts[2],
    filename: parts[3],
    private: true,
  };
}

export function isCe2PrivateObjectKey(key) {
  return !!parseCe2PrivateObjectKey(key);
}

export function workerOriginFromRequestUrl(requestUrl) {
  try {
    return new URL(requestUrl).origin;
  } catch (_) {
    return '';
  }
}

export function workerMediaLocator(workerOrigin, objectKey) {
  const origin = String(workerOrigin || '').replace(/\/$/, '');
  if (!origin || !objectKey) return '';
  return `${origin}/media?key=${encodeURIComponent(objectKey)}`;
}

export function objectKeyFromMediaUrl(url, publicBase) {
  const raw = String(url || '');
  if (!raw) return '';
  if (isCe2PrivateObjectKey(raw)) return parseCe2PrivateObjectKey(raw).key;
  try {
    const u = new URL(raw);
    const fromQuery = u.searchParams.get('key');
    if (fromQuery) {
      const parsed = parseCe2PrivateObjectKey(fromQuery);
      if (parsed) return parsed.key;
    }
    const path = u.pathname.replace(/^\/+/, '');
    if (path === 'media' || path.indexOf('media/') === 0) {
      const rest = path === 'media' ? '' : path.slice('media/'.length);
      if (rest) {
        const parsed = parseCe2PrivateObjectKey(decodeURIComponent(rest));
        if (parsed) return parsed.key;
      }
    }
  } catch (_) {}
  const base = String(publicBase || '').replace(/\/$/, '');
  if (base && raw.indexOf(base + '/') === 0) {
    return raw.slice(base.length + 1).split('?')[0];
  }
  return '';
}

/**
 * CE2 private uploads return objectKey + Worker locator — never a public CDN URL.
 * Public folders keep `{ publicUrl }` so board/UGC clients are unchanged.
 */
export function buildUploadResponse(folder, objectKey, opts) {
  opts = opts || {};
  if (isCe2PrivateUploadFolder(folder) || isCe2PrivateObjectKey(objectKey)) {
    const key = isCe2PrivateObjectKey(objectKey)
      ? parseCe2PrivateObjectKey(objectKey).key
      : objectKey;
    return {
      objectKey: key,
      url: workerMediaLocator(opts.workerOrigin, key),
    };
  }
  const publicBase = String(opts.publicBase || '').replace(/\/$/, '');
  return { publicUrl: `${publicBase}/${objectKey}` };
}

export function uploadResponseHasPublicCdn(body) {
  if (!body || typeof body !== 'object') return false;
  if (!body.publicUrl) return false;
  return /r2\.dev\//i.test(String(body.publicUrl));
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

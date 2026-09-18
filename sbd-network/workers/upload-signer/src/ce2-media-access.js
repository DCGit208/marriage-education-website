/**
 * Firestore membership checks for CE2 private R2 media.
 * DMs: ce2_conversations/{scopeId}.participantIds
 * Groups: communicationGroups/{scopeId}/members/{uid}
 */

import { parseFirestoreMap } from './notification-access.js';

export const FIRESTORE_PROJECT_ID = 'marriage-education';

function firestoreDocUrl(projectId, docPath, fieldPaths) {
  const encoded = String(docPath || '')
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${encoded}`;
  const fields = (fieldPaths || []).filter(Boolean);
  if (fields.length) {
    url += '?' + fields.map((f) => 'mask.fieldPaths=' + encodeURIComponent(f)).join('&');
  }
  return url;
}

export function isCe2AdminUser(userData, tokenClaims) {
  if (tokenClaims && tokenClaims.admin === true) return true;
  if (!userData) return false;
  const role = String(userData.role || '');
  if (/^admin$/i.test(role)) return true;
  const roles = Array.isArray(userData.roles) ? userData.roles : [];
  return roles.some((r) => /^admin$/i.test(String(r)));
}

export function decodeJwtPayload(idToken) {
  try {
    const payload = String(idToken || '').split('.')[1];
    if (!payload) return {};
    let padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4;
    if (pad) padded += '='.repeat(4 - pad);
    return JSON.parse(atob(padded));
  } catch (_) {
    return {};
  }
}

async function readFirestoreDoc(fetchImpl, accessToken, projectId, docPath, fieldPaths) {
  const res = await fetchImpl(firestoreDocUrl(projectId, docPath, fieldPaths), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  if (data.error) return null;
  return parseFirestoreMap(data.fields || {});
}

export async function uidCanAccessCe2Scope(uid, scopeId, deps) {
  const fetchImpl = deps.fetchImpl || fetch;
  const accessToken = deps.accessToken;
  const projectId = deps.projectId || FIRESTORE_PROJECT_ID;
  if (!uid || !scopeId || !accessToken) return false;

  if (deps.tokenClaims && isCe2AdminUser(null, deps.tokenClaims)) return true;

  const userData = await readFirestoreDoc(
    fetchImpl,
    accessToken,
    projectId,
    `users/${uid}`,
    ['role', 'roles']
  );
  if (isCe2AdminUser(userData, deps.tokenClaims)) return true;

  const conv = await readFirestoreDoc(
    fetchImpl,
    accessToken,
    projectId,
    `ce2_conversations/${scopeId}`,
    ['participantIds']
  );
  const participants = conv && Array.isArray(conv.participantIds) ? conv.participantIds : [];
  if (participants.map(String).indexOf(String(uid)) >= 0) return true;

  const member = await readFirestoreDoc(
    fetchImpl,
    accessToken,
    projectId,
    `communicationGroups/${scopeId}/members/${uid}`,
    []
  );
  return !!member;
}

const membershipCache = new Map();
const MEMBERSHIP_TTL_MS = 45000;

export async function uidCanAccessCe2ScopeCached(uid, scopeId, deps) {
  const key = `${uid}::${scopeId}`;
  const now = Date.now();
  const hit = membershipCache.get(key);
  if (hit && hit.expires > now) return hit.ok;
  const ok = await uidCanAccessCe2Scope(uid, scopeId, deps);
  membershipCache.set(key, { ok, expires: now + MEMBERSHIP_TTL_MS });
  if (membershipCache.size > 500) {
    for (const [k, v] of membershipCache) {
      if (v.expires <= now) membershipCache.delete(k);
    }
  }
  return ok;
}

export function resetCe2MembershipCache() {
  membershipCache.clear();
}

export function parseByteRange(header, size) {
  if (!header || !size) return null;
  const m = String(header).match(/^bytes=(\d*)-(\d*)$/i);
  if (!m) return null;
  let start = m[1] === '' ? NaN : Number(m[1]);
  let end = m[2] === '' ? NaN : Number(m[2]);
  if (Number.isNaN(start) && Number.isNaN(end)) return null;
  if (Number.isNaN(start)) {
    const suffix = end;
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else if (Number.isNaN(end)) {
    end = size - 1;
  }
  if (start < 0 || end >= size || start > end) return null;
  return { offset: start, length: end - start + 1, start, end };
}

/**
 * CE2 legacy public R2 → private signed-media migrate helpers.
 *
 * New uploads already land on sbd-media-ce2 under ce2/… . Older conversation
 * photos/videos/voice notes may still be world-readable on sbd-media
 * (pub-*.r2.dev/dm_audio|dm_attachments|dm_videos/…). This module:
 *   - detects those leftover CE2 keys (never ugc-photos / board covers)
 *   - plans a conversation-scoped ce2/… destination
 *   - copies via R2 bindings (no HTTP fetch of arbitrary URLs)
 *   - patches the message pointer so playback uses signed GET
 *
 * Public objects are left in place by default so forwarded copies keep
 * playing until each message is migrated. Pass deletePublic: true to
 * remove the source after a successful pointer update.
 */

import {
  CE2_DM_FOLDERS,
  CE2_PRIVATE_PREFIX,
  isCe2PrivateObjectKey,
  parseCe2PrivateObjectKey,
  ce2PrivateObjectKey,
  isSafeUploadScopeId,
  isSafeObjectFilename,
  workerMediaLocator,
  objectKeyFromMediaUrl,
} from './upload-policy.js';

export const CE2_MEDIA_URL_FIELDS = [
  'imageUrl',
  'imageThumbUrl',
  'videoUrl',
  'videoPosterUrl',
  'audioUrl',
];

export const MAX_MIGRATE_BYTES = 120 * 1024 * 1024;

const PUBLIC_UGC_FOLDERS = ['ugc-photos', 'ugc-videos', 'course-covers'];

export function isSafeMessageId(id) {
  return /^[A-Za-z0-9._-]{1,128}$/.test(String(id || ''));
}

export function normalizeConversationType(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'group') return 'group';
  if (t === 'direct' || t === 'dm') return 'direct';
  return '';
}

export function messageDocPath(conversationType, conversationId, messageId) {
  const type = normalizeConversationType(conversationType);
  if (!type || !isSafeUploadScopeId(conversationId) || !isSafeMessageId(messageId)) return '';
  if (type === 'group') {
    return `communicationGroups/${conversationId}/ce2_messages/${messageId}`;
  }
  return `ce2_conversations/${conversationId}/ce2_messages/${messageId}`;
}

export function safeMigrateFilename(name) {
  const raw = String(name || '')
    .split('/')
    .pop()
    .split('?')[0];
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
  if (isSafeObjectFilename(cleaned)) return cleaned;
  return '';
}

function stripQuery(url) {
  return String(url || '').split('?')[0];
}

export function isConfiguredPublicBaseUrl(url, publicBase) {
  const base = String(publicBase || '').replace(/\/$/, '');
  const raw = stripQuery(url);
  if (!base || !raw) return false;
  return raw === base || raw.indexOf(base + '/') === 0;
}

export function publicObjectKeyFromUrl(url, publicBase) {
  if (!isConfiguredPublicBaseUrl(url, publicBase)) return '';
  const base = String(publicBase || '').replace(/\/$/, '');
  let key = stripQuery(url).slice(base.length + 1);
  try {
    key = decodeURIComponent(key);
  } catch (_) {}
  if (!key || key.indexOf('..') >= 0 || key.indexOf('\\') >= 0) return '';
  return key.replace(/^\/+/, '');
}

function pathPartsFromKey(key) {
  return String(key || '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);
}

/**
 * True for leftover world-readable CE2 DM objects on the public CDN.
 * False for private ce2/ locators, Firebase Storage, and UGC/board folders.
 */
export function isLegacyPublicCe2MediaUrl(url, publicBase) {
  return !!parseLegacyPublicCe2Media(url, publicBase, { allowAnyR2Dev: !publicBase });
}

export function classifyMediaRef(url, publicBase) {
  const raw = String(url || '');
  if (!raw) return 'empty';
  // Public CDN leftovers first — a ce2/ key on r2.dev is still world-readable.
  const parsed = parseLegacyPublicCe2Media(raw, publicBase, { allowAnyR2Dev: !publicBase });
  if (parsed) return 'legacy-public-ce2';
  if (isCe2PrivateObjectKey(raw) || parseCe2PrivateObjectKey(objectKeyFromMediaUrl(raw, publicBase))) {
    return 'private-ce2';
  }
  try {
    const u = new URL(raw);
    const parts = pathPartsFromKey(u.pathname);
    if (/\.r2\.dev$/i.test(u.hostname) && PUBLIC_UGC_FOLDERS.indexOf(parts[0]) >= 0) {
      return 'public-ugc';
    }
  } catch (_) {}
  const key = publicObjectKeyFromUrl(raw, publicBase);
  if (key && PUBLIC_UGC_FOLDERS.indexOf(key.split('/')[0]) >= 0) return 'public-ugc';
  return 'other';
}

/**
 * Parse a leftover public CE2 object.
 *
 * Worker copy MUST pass publicBase (env.R2_PUBLIC_URL) so we only read from
 * our sbd-media bucket — never fetch arbitrary hosts.
 *
 * Client UI may omit publicBase to match any *.r2.dev dm_* URL.
 */
export function parseLegacyPublicCe2Media(url, publicBase, opts) {
  opts = opts || {};
  const raw = String(url || '');
  if (!raw) return null;
  if (isCe2PrivateObjectKey(raw)) return null;
  const fromLocator = objectKeyFromMediaUrl(raw, publicBase);
  if (fromLocator && isCe2PrivateObjectKey(fromLocator) && !isConfiguredPublicBaseUrl(raw, publicBase)) {
    return null;
  }

  let key = '';
  if (publicBase && isConfiguredPublicBaseUrl(raw, publicBase)) {
    key = publicObjectKeyFromUrl(raw, publicBase);
  } else if (opts.allowAnyR2Dev) {
    try {
      const u = new URL(raw);
      if (!/\.r2\.dev$/i.test(u.hostname)) return null;
      key = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    } catch (_) {
      return null;
    }
  } else {
    return null;
  }

  if (!key || key.indexOf('..') >= 0) return null;
  const parts = pathPartsFromKey(key);
  if (!parts.length) return null;
  if (PUBLIC_UGC_FOLDERS.indexOf(parts[0]) >= 0) return null;

  let folder = '';
  let scopeId = '';
  let filename = '';

  if (parts[0] === CE2_PRIVATE_PREFIX && parts.length >= 4) {
    folder = parts[1];
    scopeId = parts[2];
    filename = parts.slice(3).join('_');
  } else if (CE2_DM_FOLDERS.indexOf(parts[0]) >= 0 && parts.length === 2) {
    folder = parts[0];
    filename = parts[1];
  } else if (CE2_DM_FOLDERS.indexOf(parts[0]) >= 0 && parts.length === 3) {
    folder = parts[0];
    scopeId = parts[1];
    filename = parts[2];
  } else {
    return null;
  }

  if (CE2_DM_FOLDERS.indexOf(folder) < 0) return null;
  const safeName = safeMigrateFilename(filename);
  if (!safeName) return null;
  if (scopeId && !isSafeUploadScopeId(scopeId)) return null;

  return {
    sourceKey: parts.join('/'),
    folder: folder,
    scopeId: scopeId || '',
    filename: safeName,
  };
}

export function destPrivateKeyForLegacy(parsed, conversationId) {
  if (!parsed || !isSafeUploadScopeId(conversationId)) return '';
  if (parsed.scopeId && parsed.scopeId !== conversationId) return '';
  return ce2PrivateObjectKey(parsed.folder + '/' + conversationId, parsed.filename);
}

export function collectLegacyCe2MediaFields(message, publicBase, opts) {
  const out = [];
  const msg = message || {};
  CE2_MEDIA_URL_FIELDS.forEach((field) => {
    const url = msg[field];
    const parsed = parseLegacyPublicCe2Media(url, publicBase, opts);
    if (parsed) out.push({ field: field, url: url, parsed: parsed });
  });
  return out;
}

export function replacementObjectKey(value, conversationId) {
  const raw = String(value || '');
  if (!raw || !isSafeUploadScopeId(conversationId)) return '';
  let parsed = parseCe2PrivateObjectKey(raw);
  if (!parsed) {
    const fromUrl = objectKeyFromMediaUrl(raw, '');
    parsed = parseCe2PrivateObjectKey(fromUrl);
  }
  if (!parsed || parsed.scopeId !== conversationId) return '';
  return parsed.key;
}

export function toFirestoreFields(obj) {
  const fields = {};
  Object.keys(obj || {}).forEach((k) => {
    const v = obj[k];
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
  });
  return { fields: fields };
}

export function firestoreUpdateMask(fieldNames) {
  return (fieldNames || [])
    .map((f) => 'updateMask.fieldPaths=' + encodeURIComponent(f))
    .join('&');
}

/**
 * Build copy/replace operations for one message. Never includes UGC/board keys.
 */
export function buildMigratePlan(message, conversationId, publicBase, replacements, workerOrigin) {
  replacements = replacements || {};
  const updates = {};
  const copies = [];
  const replacedFields = [];
  const missing = [];
  const skipped = [];

  if (!message || message.deleted) {
    return { error: 'Message removed', status: 409 };
  }

  CE2_MEDIA_URL_FIELDS.forEach((field) => {
    const current = message[field];
    if (!current) return;
    const kind = classifyMediaRef(current, publicBase);
    if (kind === 'private-ce2') return;
    if (kind === 'public-ugc') {
      skipped.push({ field: field, reason: 'public-ugc' });
      return;
    }
    if (kind !== 'legacy-public-ce2') {
      skipped.push({ field: field, reason: kind });
      return;
    }

    const replacement = replacementObjectKey(replacements[field], conversationId);
    if (replacement) {
      updates[field] = workerMediaLocator(workerOrigin, replacement);
      replacedFields.push(field);
      return;
    }

    const parsed = parseLegacyPublicCe2Media(current, publicBase);
    if (!parsed) {
      skipped.push({ field: field, reason: 'untrusted-host' });
      return;
    }
    const destKey = destPrivateKeyForLegacy(parsed, conversationId);
    if (!destKey) {
      skipped.push({ field: field, reason: 'scope-mismatch' });
      return;
    }
    copies.push({
      field: field,
      sourceKey: parsed.sourceKey,
      destKey: destKey,
    });
    updates[field] = workerMediaLocator(workerOrigin, destKey);
  });

  return {
    updates: updates,
    copies: copies,
    replacedFields: replacedFields,
    missing: missing,
    skipped: skipped,
  };
}

/**
 * Membership-gated migrate. Bucket I/O is injected so tests do not need R2.
 */
export async function executeCe2MediaMigrate(input) {
  const callerUid = input && input.callerUid;
  const conversationId = input && input.conversationId;
  const conversationType = input && input.conversationType;
  const messageId = input && input.messageId;
  const replacements = (input && input.replacements) || {};
  const deletePublic = !!(input && input.deletePublic);
  const publicBase = input && input.publicBase;
  const workerOrigin = input && input.workerOrigin;

  if (!callerUid || !isSafeUploadScopeId(conversationId) || !isSafeMessageId(messageId)) {
    return { error: 'Invalid request', status: 400 };
  }
  const type = normalizeConversationType(conversationType);
  if (!type) return { error: 'Invalid conversation type', status: 400 };
  if (!publicBase || !workerOrigin) {
    return { error: 'Media migrate not configured', status: 503 };
  }

  const allowed = await input.uidCanAccess(callerUid, conversationId);
  if (!allowed) return { error: 'Forbidden', status: 403 };

  const docPath = messageDocPath(type, conversationId, messageId);
  const message = await input.readMessage(docPath);
  if (!message) return { error: 'Not found', status: 404 };
  if (message.deleted) return { error: 'Message removed', status: 409 };
  if (message.conversationId && String(message.conversationId) !== String(conversationId)) {
    return { error: 'Not found', status: 404 };
  }

  const plan = buildMigratePlan(message, conversationId, publicBase, replacements, workerOrigin);
  if (plan.error) return plan;

  if (!Object.keys(plan.updates).length) {
    const ugcOnly = plan.skipped.some((s) => s.reason === 'public-ugc');
    return {
      ok: true,
      alreadyPrivate: plan.skipped.every((s) => s.reason !== 'legacy-public-ce2') && !plan.copies.length,
      copied: [],
      replaced: [],
      missing: [],
      skipped: plan.skipped,
      untouchedUgc: ugcOnly,
    };
  }

  const applied = Object.assign({}, plan.updates);
  const copiedFields = [];

  for (let i = 0; i < plan.copies.length; i += 1) {
    const copy = plan.copies[i];
    if (plan.replacedFields.indexOf(copy.field) >= 0) continue;
    const result = await input.copyObject({
      sourceKey: copy.sourceKey,
      destKey: copy.destKey,
    });
    if (!result || !result.ok) {
      const reason = (result && result.reason) || 'copy_failed';
      if (reason === 'not_found') {
        delete applied[copy.field];
        plan.missing.push(copy.field);
        continue;
      }
      return { error: reason === 'too_large' ? 'File too large to migrate' : 'Copy failed', status: 502, code: reason };
    }
    copiedFields.push(copy.field);
  }

  if (!Object.keys(applied).length) {
    return {
      error: 'Source missing',
      status: 409,
      code: 'source_missing',
      missing: plan.missing,
    };
  }

  applied.mediaPrivacy = 'private';
  applied.mediaMigratedAt = (input.now && input.now()) || new Date().toISOString();

  await input.writeMessageFields(docPath, applied);

  let deletedPublic = 0;
  if (deletePublic && typeof input.deletePublicObject === 'function') {
    const seen = new Set();
    for (let i = 0; i < plan.copies.length; i += 1) {
      const copy = plan.copies[i];
      if (!applied[copy.field] || seen.has(copy.sourceKey)) continue;
      seen.add(copy.sourceKey);
      try {
        await input.deletePublicObject(copy.sourceKey);
        deletedPublic += 1;
      } catch (_) {}
    }
  }

  const locators = {};
  CE2_MEDIA_URL_FIELDS.forEach((field) => {
    if (applied[field]) locators[field] = applied[field];
  });

  return {
    ok: true,
    copied: copiedFields,
    replaced: plan.replacedFields,
    missing: plan.missing,
    locators: locators,
    deletedPublic: deletedPublic,
    skipped: plan.skipped,
  };
}
